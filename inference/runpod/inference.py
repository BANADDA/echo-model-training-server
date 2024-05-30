import json
import sys

import requests


def generate_text(endpoint_url, prompt):
    payload = {
        "inputs": prompt,
        "parameters": {
            "best_of": 1,
            "decoder_input_details": True,
            "details": True,
            "do_sample": True,
            "max_new_tokens": 512,
            "repetition_penalty": 1.03,
            "return_full_text": False,
            "seed": None,
            "stop": ["photographer"],
            "temperature": 0.5,
            "top_k": 10,
            "top_p": 0.95,
            "truncate": None,
            "typical_p": 0.95,
            "watermark": True
        }
    }
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json'
    }
    response = requests.post(endpoint_url, headers=headers, data=json.dumps(payload))

    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")  # Print HTTP error message
        print(f"Response content: {response.content}")  # Print the response content
        sys.exit(1)
    except Exception as err:
        print(f"Other error occurred: {err}")  # Print any other error message
        sys.exit(1)
    
    try:
        return response.json()
    except json.JSONDecodeError:
        print(f"Failed to parse JSON response: {response.content}")  # Print the response content
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Error: Missing endpoint_url or prompt")
        sys.exit(1)

    endpoint_url = sys.argv[1]
    prompt = sys.argv[2]

    try:
        result = generate_text(endpoint_url, prompt)
        print(json.dumps(result))
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
