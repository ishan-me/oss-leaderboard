""" Main module for the OSS Leaderboard. """
import logging

from leaderboard.queries.query import query
from leaderboard.utils.data import get_date

from leaderboard.utils.intermediate_score_table import get_intermediate_score_table
from leaderboard.utils.final_score_table import get_final_score_table
from leaderboard.utils.data import convert_df_to_markdown
from multi_users_fetch import fetch_contributions_for_multi_users

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("main")

variables = {"timedelta": get_date(5), "username": "", "dataCount": 5}


def main():
    """ Script entrypoint. """

    result = fetch_contributions_for_multi_users(query, variables)

    intermediate_score_table = get_intermediate_score_table(result)
    final_score_table = get_final_score_table(intermediate_score_table)
    markdown_table = convert_df_to_markdown(final_score_table)

    print(markdown_table)


main()
