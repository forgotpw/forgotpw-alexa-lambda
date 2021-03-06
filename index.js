const Alexa = require('ask-sdk-core');
const Mustache = require('mustache');
const logger = require('./logger');
const config = require('./config');

// shared modules with lex chatbot:
const authorizedRequest = require('./lib/authorizedRequest');
const ApplicationService = require('./lib/applicationService');
const PhoneTokenService = require('phone-token-service');
const TwilioLib = require('./lib/twilioLib');


const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Welcome to Rosa, you can say hello!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('Hello World', speechText)
      .getResponse();
  }
};

const HelloIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelloIntent';
  },
  async handle(handlerInput) {
    const alexaUserId = handlerInput.requestEnvelope.session.user.userId;
    const userToken = await getUserTokenFromAlexaUserId(alexaUserId);

    let speechText;
    // if first time user
    if (userToken == '') {
      speechText = 'Hi, I make it a lot easier to be secure online.  Try storing a password with me.  You can make it a test password just to try it out.';
    } else {
      // next time say something different back
      const helloAgainResponses = [
        "Hi, hope you're being safe and secure online today.",
        "Hi, thanks for checking in on me.  I'm just here keeping people safe and secure.",
        "Hi.  You know what the funniest password is I've heard all day?  1 2 3 4 5.  I mean, come on."
      ];
      speechText = helloAgainResponses[Math.floor(Math.random() * helloAgainResponses.length)];
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Hello', speechText)
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'You can say hello to me!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('Hello World', speechText)
      .getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    const speechText = `Sorry I'm not sure what you mean.`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
  }
};

const InProgressSetPhoneNumberIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'SetPhoneNumberIntent'
      && request.dialogState !== 'COMPLETED';
  },
  handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    logger.debug('InProgressSetPhoneNumberIntentHandler invoked')
    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  }
}

const CompletedSetPhoneNumberIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'SetPhoneNumberIntent'
      && request.dialogState === 'COMPLETED';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const phone = slots.PhoneNumber.value;

    logger.info(`CompletedSetPhoneNumberIntentHandler`);

    const phoneTokenService = new PhoneTokenService({
      tokenHashHmac: config.USERTOKEN_HASH_HMAC,
      s3bucket: config.USERTOKENS_S3_BUCKET,
      defaultCountryCode: 'US'
    });
    const userToken = await phoneTokenService.getTokenFromPhone(phone);
    const alexaUserId = handlerInput.requestEnvelope.session.user.userId;
    //logger.info(`Saving Alexa User ID ${alexaUserId}`);
    await phoneTokenService.setAlexaUserIdFromToken(userToken, alexaUserId);

    logger.debug(`Texting vcard to user.`);
    await TwilioLib.sendVcard(phone, userToken);

    const template = await readTemplate('vcard.tmpl');
    let msg = template;
    await TwilioLib.sendText(phone, userToken, msg);

    const speechText = `I'm sending you a text messasge now.  Please add my number to your contacts, so we can be friends.`;
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Set Phone Number', speechText)
      .getResponse();
  }
};


const StoreSecretIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StoreSecretIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const rawApplication = slots.Application.value;

    logger.info(`StoreSecretIntentHandler for ${rawApplication}`);

    const alexaUserId = handlerInput.requestEnvelope.session.user.userId;
    const userToken = await getUserTokenFromAlexaUserId(alexaUserId);
    if (userToken == '') {
      // if the user hasn't yet associated a phone number with Alexa, we need to
      // prompt for a phone number
      logger.info('No Alexa userId found in token database, redirecting to InProgressSetPhoneNumberIntentHandler');
      const speechText = `You have to tell me your phone number first!  I need it to text you links to securely store and retrieve passwords.`;
      return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
    }
    const phone = await getPhoneFromToken(userToken);

    //// FROM LEX HANDLER
    const arid = await authorizedRequest.generateAuthorizedRequestFromPhone(phone, rawApplication);
    const template = await readTemplate('store.tmpl');
    const subdomain = config.AWS_ENV == 'dev' ? 'app-dev' : 'app';
    const viewData = {
        rawApplication,
        url: `https://${subdomain}.rosa.bot/#/set?arid=${arid}`
    }
    let msg = Mustache.render(template, viewData);
    ///

    // lex chat bot hanler just returns the string, here we must send the text message
    // directly using twilio
    await TwilioLib.sendText(phone, userToken, msg);

    const speechText = `I texted you a code to store a password for ${rawApplication}`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Store Secret', speechText)
      .getResponse();
  }
};

const RetrieveSecretIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RetrieveSecretIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const rawApplication = slots.Application.value;

    logger.info(`RetrieveSecretIntentHandler for ${rawApplication}`);
    const alexaUserId = handlerInput.requestEnvelope.session.user.userId;
    const userToken = await getUserTokenFromAlexaUserId(alexaUserId);
    if (userToken == '') {
      // if the user hasn't yet associated a phone number with Alexa, we need to
      // prompt for a phone number
      logger.info('No Alexa userId found in token database, redirecting to InProgressSetPhoneNumberIntentHandler');
      const speechText = `You have to tell me your phone number first!  I need it to text you links to securely store and retrieve passwords.`;
      return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
    }
    const phone = await getPhoneFromToken(userToken);

    //// FROM LEX HANDLER
    const applicationService = new ApplicationService();
    const foundApplication = await applicationService.findApplication(rawApplication, userToken);
    let msg = '';
    if (foundApplication.matchType == 'NOTFOUND') {
        const template = await readTemplate('retrieve-notfound.tmpl');
        const viewData = {
            rawApplication
        }
        msg = Mustache.render(template, viewData);
    } else {
        let templateFile = null;
        if (foundApplication.matchType == 'EXACT_FOUND') {
            templateFile = 'retrieve.tmpl';
        } else {
            templateFile = 'retrieve-similarfound.tmpl';
        }
        // generateAuthorizedRequestFromPhone expects rawApplication but it immediately
        // converts it to normalized, and since we only have normalizedApplication here, it's
        // okay to send that, running it through normalization function again won't change anything
        const arid = await authorizedRequest.generateAuthorizedRequestFromPhone(phone, foundApplication.normalizedApplication);
        const template = await readTemplate(templateFile);
        const subdomain = config.AWS_ENV == 'dev' ? 'app-dev' : 'app';
        const viewData = {
            rawApplication,
            url: `https://${subdomain}.rosa.bot/#/get?arid=${arid}`
        }
        msg = Mustache.render(template, viewData);
    }
    ////

    // lex chat bot hanler just returns the string, here we must send the text message
    // directly using twilio
    await TwilioLib.sendText(phone, userToken, msg);

    const speechText = `I texted you the password for ${rawApplication}`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Retrieve Secret', speechText)
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speechText = 'Goodbye!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Hello World', speechText)
      .withShouldEndSession(true)
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    //any cleanup logic goes here
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    logger.error(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak(`I'm sorry, I tried to process that request and ran into an error!`)
      //.reprompt('Sorry, I can\'t understand the command. Please say again.')
      .getResponse();
  },
};

// may return an empty string if no userToken exists yet for this user, which
// would be the case if the user hadn't stored their phone number through
// alexa, which associates the alexaUserId with the tokenId.
// basically: alexaUserId -> tokenId -> phone
async function getUserTokenFromAlexaUserId(alexaUserId) {
  const phoneTokenService = new PhoneTokenService({
    tokenHashHmac: config.USERTOKEN_HASH_HMAC,
    s3bucket: config.USERTOKENS_S3_BUCKET,
    defaultCountryCode: 'US'
  });
  const userToken = await phoneTokenService.getTokenFromAlexaUserId(alexaUserId);
  return userToken;  
}

async function getPhoneFromToken(userToken) {
  const phoneTokenService = new PhoneTokenService({
    tokenHashHmac: config.USERTOKEN_HASH_HMAC,
    s3bucket: config.USERTOKENS_S3_BUCKET,
    defaultCountryCode: 'US'
  });
  const phone = await phoneTokenService.getPhoneFromToken(userToken);
  return phone;
}

async function readTemplate(templateName) {
  const fs = require('fs');
  const util = require('util');
  const readFile = util.promisify(fs.readFile);
  const contents = await readFile(`chat-templates/${templateName}`, 'utf8');
  return contents;
}

let skill;

exports.handler = async function (event, context) {
  logger.info(`Alexa Request++++${JSON.stringify(event)}`);
  if (!skill) {
    skill = Alexa.SkillBuilders.custom()
      .addRequestHandlers(
        LaunchRequestHandler,
        HelloIntentHandler,
        HelpIntentHandler,
        FallbackIntentHandler,
        StoreSecretIntentHandler,
        RetrieveSecretIntentHandler,
        InProgressSetPhoneNumberIntentHandler,
        CompletedSetPhoneNumberIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
      )
      .addErrorHandlers(ErrorHandler)
      .create();
  }

  const response = await skill.invoke(event, context);
  logger.info(`Alexa Response++++${JSON.stringify(response)}`);

  return response;
};
