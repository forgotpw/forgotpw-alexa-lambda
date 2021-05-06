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
  handle(handlerInput) {
    const speechText = 'Hello World!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Hello World', speechText)
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

    const phoneTokenService = new PhoneTokenService({
      tokenHashHmac: config.USERTOKEN_HASH_HMAC,
      s3bucket: config.USERTOKENS_S3_BUCKET,
      defaultCountryCode: 'US'
    });
    const userToken = await phoneTokenService.getTokenFromPhone(phone);
    logger.info(`Receiving phone number (token ${userToken})`);

    // TODO: store phone number alexa userId with phone token in S3 for future use

    // TODO: replace with sending vcard
    let msg = `Hi I'm Rosa.`;
    logger.info(`Sending hello text to userToken ${userToken}`);
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
    const phone = '6095551212'; // TODO replace
    const phoneTokenService = new PhoneTokenService({
      tokenHashHmac: config.USERTOKEN_HASH_HMAC,
      s3bucket: config.USERTOKENS_S3_BUCKET,
      defaultCountryCode: 'US'
    });
    const userToken = await phoneTokenService.getTokenFromPhone(phone);

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
    const phone = '6095551212'; // TODO replace
    const phoneTokenService = new PhoneTokenService({
      tokenHashHmac: config.USERTOKEN_HASH_HMAC,
      s3bucket: config.USERTOKENS_S3_BUCKET,
      defaultCountryCode: 'US'
    });
    const userToken = await phoneTokenService.getTokenFromPhone(phone);

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
