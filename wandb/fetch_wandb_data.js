// ./wandb/fetch_wandb_data.js

const fetch = require('node-fetch');

const fetchWandBData = async (projectName, runName) => {
  const apiKey = 'efa7d98857a922cbe11e78fa1ac22b62a414fbf3';
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
