// ./wandb/fetch_wandb_data.js

const fetch = require('node-fetch');

const fetchWandBData = async (projectName, runName) => {
  const apiKey = 'YOUR_WANDB_API_KEY';
  const url = `https://api.wandb.ai/v1/runs/${projectName}/${runName}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  const data = await response.json();
  return data;
};

module.exports = fetchWandBData;
