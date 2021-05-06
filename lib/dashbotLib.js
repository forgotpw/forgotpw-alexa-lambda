const logger = require('../logger')
const config = require("../config");

async function logIncomingToDashbot(userToken, incomingMessage, platformJson) {
    const configuration = {
        'debug': true,
        'redact': true, // automatically remove pii, including urls with arid's
        'timeout': 1000,
    };
    const dashbot = require('dashbot')(config.DASHBOT_API_KEY, configuration).sms;
    const incomingMessageForDashbot = {
        "text": incomingMessage,
        "userId": userToken,
        "platformJson": platformJson
    };
    logger.debug('Logging dashbot incoming message...')
    await dashbot.logIncoming(incomingMessageForDashbot);
}

async function logOutgoingToDashbot(userToken, outgoingMessage, platformJson) {
    const configuration = {
        'debug': true,
        'redact': true, // automatically remove pii, including urls with arid's
        'timeout': 1000,
    };
    const dashbot = require('dashbot')(config.DASHBOT_API_KEY, configuration).sms;
    const outgoingMessageForDashbot = {
        "text": outgoingMessage,
        "userId": userToken,
        "platformJson": platformJson
    };
    logger.debug('Logging dashbot outgoing message...')
    await dashbot.logOutgoing(outgoingMessageForDashbot);
}

module.exports = {
    logIncomingToDashbot,
    logOutgoingToDashbot
}
