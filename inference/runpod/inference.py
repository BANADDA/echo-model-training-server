# inference.py
import json

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

    if response.status_code == 200:
        return response.json()
    else:
        response.raise_for_status()

if __name__ == "__main__":
    import sys
    endpoint_url = sys.argv[1]
    prompt = sys.argv[2]

    result = generate_text(endpoint_url, prompt)
    print(result["generated_text"])
