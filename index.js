import fetch from 'node-fetch';

import 'dotenv/config';

import getQuery from './src/query';
import {
  DAYS_TO_CONSIDER,
  QUERY_NAMES,
  eventQueryGenerator,
  events,
} from './src/constants';

import { getKeys, getValues } from './src/util/key-value-util';
import { generateMarkdown } from './src/service/generate-markdown';
import { createMarkdown } from './src/service/create-markdown';

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
    const usersDetails = {};
    await Promise.all(
      usersList.map(async user => {
        const eventDetails = await fetchUserEvents(
          eventQueryGenerator(Object.values(events), user.login),
        );
        usersDetails[user.name || user.login] = eventDetails;
      }),
    ).then(() => {
      let leaderBoard = Object.keys(usersDetails).sort((a, b) => {
        return usersDetails[a].userEventList.length >
          usersDetails[b].userEventList.length
          ? -1
          : usersDetails[a].userEventList.length ===
            usersDetails[b].userEventList.length
          ? 0
          : 1;
      });
      leaderBoard = leaderBoard.map(user => {
        const contribution = {};

        Object.keys(usersDetails[user]).forEach(key => {
          const userContribution = usersDetails[user][key];

          if (typeof userContribution === 'number') {
            contribution[key] = userContribution;
          } else if (userContribution.length > 0) {
            userContribution.map(event => {
              const eventKey = Object.keys(event)[0];
              const state = event[eventKey].state || '';
              const generatedKey =
                eventKey + state.charAt(0) + state.substr(1).toLowerCase();
              if (!contribution[generatedKey]) {
                contribution[generatedKey] = 0;
              }
              contribution[generatedKey]++;
            });
          }
        });
        return Object.assign(
          {},
          {
            name: user,
          },
          contribution,
        );
      });

      const keys = getKeys(leaderBoard);

      leaderBoard = leaderBoard.slice(0, 20).reduce((acc, item) => {
        const temp = Object.assign({}, item);
        if (Object.keys(temp).length <= 2) {
          return acc;
        }
        keys.forEach(key => {
          temp[key] = temp[key] || 0;
        });
        acc.push(temp);
        return acc;
      }, []);

      getValues(leaderBoard, keys).then(res => {
        generateMarkdown(res, keys).then(contributionData => {
          createMarkdown('user.md', contributionData);
        });
      });
    });
  } catch (error) {
    // TODO
    console.log('Error user fetching', error);
  }
}

async function fetchUserEvents(query) {
  let userEventList = [];
  const userContribution = {};

  try {
    const response = await fetchUsers(query);

    if (!userContribution.repositoriesContributedTo) {
      userContribution.repositoriesContributedTo = response.data.user
        .repositoriesContributedTo
        ? response.data.user.repositoriesContributedTo.totalCount
        : 0;
    }
    let needAnotherFetch = false;
    const eventList = [];

    Object.keys(events).forEach(event => {
      const eventResult = response.data.user[event];

      if (eventResult.edges.length <= 0) {
        // userEventList = userEventList.concat([{ [event]: null }]);
        return;
      }
      if (events[event].variables.before) {
        eventResult.edges = eventResult.edges.reverse();
      }

      const lastDate = new Date(
        eventResult.edges[eventResult.edges.length - 1].node.updatedAt,
      );

      if (lastDate.getTime() >= uptoDate.getTime()) {
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
        userEventList = userEventList.concat(
          eventResult.edges
            .slice(0, uptoPositionToConsider)
            .map(edge => ({ [event]: edge.node })),
        );
      }
    });

    if (needAnotherFetch) {
      const { userEventList: remainingEventList } = await fetchUserEvents(
        eventQueryGenerator(eventList, response.login),
      );

      userEventList = userEventList.concat(remainingEventList);
    }
  } catch (err) {
    console.log('Error fetching user events', err);
  }
  return Object.assign({}, userContribution, { userEventList });
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
