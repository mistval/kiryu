import 'dotenv/config';
import util from 'util';
import { exec as execSync } from 'child_process';
import assert from 'assert';
import Eris from 'eris';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const exec = util.promisify(execSync);

const MAX_CODE_MESSAGES = 100;
const { BOT_TOKEN, CODE_CHANNEL_ID, LOG_CHANNEL_ID, PROGRAMMER_IDS } = process.env;

if (!BOT_TOKEN || !CODE_CHANNEL_ID || !PROGRAMMER_IDS || !LOG_CHANNEL_ID) {
  throw new Error('Expected BOT_TOKEN, CODE_CHANNEL_ID, PROGRAMMER_IDS, and LOG_CHANNEL_ID environment variables.');
}

const bot = new Eris(BOT_TOKEN);

const allowedProgrammers = PROGRAMMER_IDS.split(',');
const messageHandlers = [];
const codeMessages = [];
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

    await exec(`npm install ${installSource ?? name}`, { cwd: __dirname });
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
    console.warn('Failed to log error');
    console.warn(err);
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

  for (const codeChannelMessage of codeMessages) {
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
  for (const messageHandler of messageHandlers) {
    try {
      await messageHandler(msg);
    } catch (err) {
      logError(`Error processing message ${msg.id}`, err);
    }
  }
}

bot.on('messageCreate', async (msg) => {
  if (msg.author.bot) {
    return;
  }

  if (msg.channel.id === CODE_CHANNEL_ID && allowedProgrammers.includes(msg.author.id)) {
    codeMessages.push(msg);
    return refreshCode();
  }

  return handleMessage(msg);
});

bot.on('messageUpdate', (msg) => {
  if (msg.author.bot) {
    return;
  }

  if (msg.channel.id === CODE_CHANNEL_ID) {
    const codeMessageIndex = codeMessages.findIndex(m => m.id === msg.id);
    if (codeMessageIndex !== -1) {
      codeMessages[codeMessageIndex] = msg;
      return refreshCode();
    }
  }

  return handleMessage(msg);
});

bot.on('messageDelete', (msg) => {
  const codeMessageIndex = codeMessages.findIndex(m => m.id === msg.id);
  if (codeMessageIndex !== -1) {
    codeMessages.splice(codeMessageIndex, 1);
    refreshCode();
  }
});

bot.on('error', (err) => {
  console.warn(err);
});

bot.on('ready', async () => {
  const guildId = bot.channelGuildMap[CODE_CHANNEL_ID];
  if (!guildId) {
    console.warn('Cannot find the guild I am supposed to be in.');
    process.exit(1);
  }

  const codeChannel = bot.guilds.get(guildId).channels.get(CODE_CHANNEL_ID);
  if (!codeChannel) {
    console.warn('Cannot find the code channel');
    process.exit(1);
  }

  try {
    const codeChannelMessages = await codeChannel.getMessages({ limit: MAX_CODE_MESSAGES });
    if (codeChannelMessages.length >= MAX_CODE_MESSAGES) {
      console.warn(`There are too many messages in the code channel.`);
      process.exit(1);
    }

    codeMessages.splice(0, codeMessages.length);
    codeMessages.push(
      ...codeChannelMessages.filter(m => allowedProgrammers.includes(m.author.id)),
    );

    await refreshCode();
  } catch (err) {
    console.warn('Error loading code');
    console.warn(err);
    process.exit(1);
  }

  console.log('Started successfully.');
});

bot.connect().catch(err => {
  console.warn('Error connecting to Discord');
  console.warn(err);
  process.exit(1);
});
