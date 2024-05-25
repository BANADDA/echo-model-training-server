import json
import sys

import pandas as pd

import wandb


def fetch_wandb_data(entity_name, project_name, run_id, api_key):
    # Initialize the API and fetch the run
    api = wandb.Api()
    run = api.run(f"{entity_name}/{project_name}/{run_id}")

    # Fetch the history of the run (logged metrics)
    history = run.history()

    # Convert history to JSON
    history_json = history.to_json(orient='split')
    return history_json

if __name__ == "__main__":
    entity_name = sys.argv[1]
    project_name = sys.argv[2]
    run_id = sys.argv[3]
    api_key = sys.argv[4]

    data = fetch_wandb_data(entity_name, project_name, run_id, api_key)
    print(data)
