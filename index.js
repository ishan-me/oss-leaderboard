import fetch from 'node-fetch';

import 'dotenv/config';

import getQuery from './src/query';
import {
  DAYS_TO_CONSIDER,
  QUERY_NAMES,
  eventQueryGenerator,
  events,
} from './src/constants';

const uptoDate = new Date();
uptoDate.setDate(uptoDate.getDate() - DAYS_TO_CONSIDER);

async function fetchUsers(query) {
  const accessToken = process.env.ACCESS_TOKEN;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      body: JSON.stringify(query),
      headers: {
        authorization: `token ${accessToken}`,
      },
    });
    return res.json();
  } catch (error) {
    // TODO
    throw error.response;
  }
}

async function init() {
  const query = getQuery(QUERY_NAMES.MEMBERS_WITH_ROLE);
  try {
    const usersList = await fetchData(query).catch(err => {
      throw err;
    });
    usersList.forEach(async user => {
      const { totalCounter: userEvents, userEventList } = await fetchUserEvents(
        eventQueryGenerator(Object.values(events), user.login),
      );
      console.log(
        `${user.name || user.login}: ${JSON.stringify(
          userEventList,
        )} =>${JSON.stringify(userEvents)}`,
      );
    });
    // const userEvents = await fetchUserEvents(
    //   eventQueryGenerator(Object.values(events), 'kabirbaidhya'),
    // );
    // console.log(`${'kabirbaidhya'}: ${JSON.stringify(userEvents)}`);
  } catch (error) {
    // TODO
    console.log('Error user fetching', error);
  }
}

async function fetchUserEvents(query) {
  const totalCounter = {};
  let userEventList = [];
  try {
    const response = await fetchUsers(query).catch(err => {
      throw err;
    });
    let needAnotherFetch = false;
    const eventList = [];

    Object.keys(events).forEach(event => {
      const eventResult = response.data.user[event];

      if (eventResult.edges.length <= 0) {
        return;
      }
      if (events[event].variables.before) {
        eventResult.edges = eventResult.edges.reverse();
      }

      const lastDate = new Date(
        eventResult.edges[eventResult.edges.length - 1].node.updatedAt,
      );
      // if (event === 'issueComments') {
      //   console.log('here', lastDate);
      // }

      if (lastDate.getTime() >= uptoDate.getTime()) {
        totalCounter[event] =
          (totalCounter[event] || 0) + eventResult.edges.length;
        userEventList = userEventList.concat(
          eventResult.edges.map(edge => ({ [event]: edge.node })),
        );

        if (eventResult.pageInfo.hasNextPage) {
          needAnotherFetch = true;

          const eventFetchMore = Object.assign({}, events[event]);
          if (eventFetchMore.variables.after) {
            eventFetchMore.variables.after.value =
              eventResult.pageInfo.endCursor;
          } else if (eventFetchMore.variables.before) {
            eventFetchMore.variables.before.value =
              eventResult.pageInfo.endCursor;
          }

          eventList.push(eventFetchMore);
        }
      } else {
        const uptoPositionToConsider = countHowManyLiesWithin(
          eventResult.edges,
          0,
          eventResult.edges.length - 1,
        );
        totalCounter[event] =
          (totalCounter[event] || 0) + uptoPositionToConsider;
        userEventList = userEventList.concat(
          eventResult.edges
            .slice(0, uptoPositionToConsider)
            .map(edge => ({ [event]: edge.node })),
        );
      }
    });

    if (needAnotherFetch) {
      const {
        totalCounter: currentCountstotalCounts,
        userEventList: remainingEventList,
      } = await fetchUserEvents(eventQueryGenerator(eventList, response.login));

      userEventList = userEventList.concat(remainingEventList);

      Object.keys(events).forEach(event => {
        totalCounter[event] =
          (totalCounter[event] || 0) + currentCountstotalCounts[event];
      });
    }
  } catch (err) {
    console.log('Error fetching user events', err);
  }
  return { totalCounter, userEventList };
}

async function fetchData(query) {
  let hasNextPage = false;
  let usedQuery = query;
  let users = [];

  do {
    try {
      const response = await fetchUsers(usedQuery);
      users = [...users, ...response.data.organization.membersWithRole.nodes];
      const pageInfo = response.data.organization.membersWithRole.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      usedQuery = getQuery(QUERY_NAMES.FETCH_MORE_MEMBERS, {
        first: 100,
        after: pageInfo.endCursor,
      });
    } catch (error) {
      // TODO
    }
  } while (hasNextPage);
  console.log(`No of Users: ${users.length}`);
  return users;
}

/**
 * Binary search to count total events which lies after target date
 *
 * @param {*} events Array of events.
 * @param {*} l Left bound.
 * @param {*} r Right bound.
 */
const countHowManyLiesWithin = (eventDetail, l, r) => {
  if (l === r) {
    return l;
  }
  const mid = parseInt(l + (r - l) / 2);
  const midEventDate = new Date(eventDetail[mid].node.updatedAt);
  if (midEventDate.getTime() >= uptoDate.getTime()) {
    return countHowManyLiesWithin(eventDetail, mid + 1, r);
  }
  return countHowManyLiesWithin(eventDetail, l, mid);
};

init();