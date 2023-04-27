# Kiryu

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
