# Kiryu

## Docker

The easiest way to run Kiryu is with Docker:

```bash
docker run \
  --name kiryu \
  --restart unless-stopped \
  -e PROGRAMMER_IDS='YOUR USER ID HERE' \
  -e BOT_TOKEN='YOUR BOT TOKEN HERE' \
  -e CODE_CHANNEL_IDS='YOUR CODE CHANNEL ID HERE' \
  -e LOG_CHANNEL_ID='YOUR LOG CHANNEL ID HERE' \
  -d \
  mistval/kiryu
```

## Node

Or, you can run Kiryu with plain old Node.js.

1. Install [Node.js](https://nodejs.org/en) v18.
2. Run `npm install` in this directory
3. Create a .env file in this directory with your configuration:

```bash
BOT_TOKEN=YOUR BOT TOKEN HERE
PROGRAMMER_IDS=YOUR USER ID HERE
CODE_CHANNEL_IDS=YOUR CODE CHANNEL ID HERE
LOG_CHANNEL_ID=YOUR LOG CHANNEL ID HERE
```

4. Run `node index.js`
