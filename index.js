import 'dotenv/config';
import { execSync } from 'child_process';
import assert from 'assert';
import Eris, { Constants as ErisConstants } from 'eris';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_CODE_MESSAGES = 99;
const { BOT_TOKEN, CODE_CHANNEL_IDS, LOG_CHANNEL_ID, PROGRAMMER_IDS } = process.env;

if (!BOT_TOKEN || !CODE_CHANNEL_IDS || !PROGRAMMER_IDS || !LOG_CHANNEL_ID) {
  throw new Error('Expected BOT_TOKEN, CODE_CHANNEL_IDS, PROGRAMMER_IDS, and LOG_CHANNEL_ID environment variables.');
}

const bot = new Eris(BOT_TOKEN, { intents: ErisConstants.Intents.all });

const allowedProgrammers = PROGRAMMER_IDS.split(',');
const codeChannels = CODE_CHANNEL_IDS.split(',');
const messageHandlers = [];
const codeMessages = new Map();
const moduleLoaderPromises = {};
const shared = {};

function getModule(name, installSource) {
  if (moduleLoaderPromises[name]) {
    return moduleLoaderPromises[name];
  }

  moduleLoaderPromises[name] = (async() => {
    try {
      return await import(name);
    } catch (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND') {
        throw err;
      }
    }

    execSync(`npm install ${installSource ?? name}`, { cwd: __dirname });
    console.log('Exiting due to new package installation. Restart me.');
    process.exit(0);
  })();

  return moduleLoaderPromises[name];
}

async function logError(description, err) {
  console.warn(err);

  try {
    await bot.createMessage(LOG_CHANNEL_ID, `${description}: ${err.message}`);
  } catch (err) {
    console.warn('Failed to log error', err);
  }
}

async function tryAddReaction(msg, reaction) {
  try {
    await msg.addReaction(reaction);
  } catch (err) {
    return logError(`Failed to add reaction ${reaction} to ${msg.id}`, err);
  }
}

async function tryRemoveReaction(msg, reaction) {
  try {
    await msg.removeReactionEmoji(reaction);
  } catch (err) {
    return logError(`Failed to remove reaction ${reaction} from ${msg.id}`, err);
  }
}

async function refreshCode() {
  messageHandlers.splice(0, messageHandlers.length);

  for (const codeChannelMessage of codeMessages.values()) {
    assert(allowedProgrammers.includes(codeChannelMessage.author.id));

    try {
      const jsCodeMatches = [...codeChannelMessage.content.matchAll(/```js(.*?)```/gs)];
      for (const jsCodeMatch of jsCodeMatches) {
        await eval(jsCodeMatch[1]);
      }

      tryAddReaction(codeChannelMessage, '✅');
      tryRemoveReaction(codeChannelMessage, '❌');
    } catch (err) {
      tryRemoveReaction(codeChannelMessage, '✅');
      tryAddReaction(codeChannelMessage, '❌');
      logError(`Error evaluating code in message ${codeChannelMessage.id}`, err);
    }
  }
}

async function handleMessage(msg) {
  if (msg.author.bot) {
    return;
  }

  for (const messageHandler of messageHandlers) {
    try {
      await messageHandler(msg);
    } catch (err) {
      logError(`Error processing message ${msg.id}`, err);
    }
  }
}

bot.on('messageCreate', async (msg) => {
  if (codeChannels.includes(msg.channel.id) && allowedProgrammers.includes(msg.author.id)) {
    codeMessages.set(msg.id, msg);
    return refreshCode();
  }

  return handleMessage(msg);
});

bot.on('messageUpdate', (msg) => {
  if (codeMessages.has(msg.id)) {
    codeMessages.set(msg.id, msg);
    return refreshCode();
  }

  return handleMessage(msg);
});

bot.on('messageDelete', (msg) => {
  if (codeMessages.delete(msg.id)) {
    refreshCode();
  }
});

bot.on('error', (err) => {
  console.warn(err);
});

bot.on('ready', async () => {
  for (const codeChannelId of codeChannels) {
    const guildId = bot.channelGuildMap[codeChannelId];
    if (!guildId) {
      console.warn(`Cannot find guild for code channel ${codeChannelId}`);
      process.exit(1);
    }

    const codeChannel = bot.guilds.get(guildId).channels.get(codeChannelId);

    try {
      const codeChannelMessages = await codeChannel.getMessages({ limit: MAX_CODE_MESSAGES + 1 });
      if (codeChannelMessages.length > MAX_CODE_MESSAGES) {
        console.warn(`There are too many messages in the code channel.`);
        process.exit(1);
      }

      codeChannelMessages
        .filter(m => allowedProgrammers.includes(m.author.id))
        .forEach(m => codeMessages.set(m.id, m));
    } catch (err) {
      console.warn('Error loading code', err);
      process.exit(1);
    }
  }

  await refreshCode();

  console.log('Started successfully.');
});

bot.connect().catch(err => {
  console.warn('Error connecting to Discord', err);
  process.exit(1);
});
