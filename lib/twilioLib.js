const logger = require('../logger')
const config = require("../config");
const DashbotLib = require('./dashbotLib');

// sends the vcard raw via twilio, bypassing lex, which apparently can't send
// the vcard itself
async function sendVcard(phone, userToken) {
    const twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

    let params = {
        body: 'Open the contact card I sent to add me to your contacts.',
        from: config.TWILIO_FROM_NUMBER,
        to: phone,
        mediaUrl: 'https://www.rosa.bot/rosa.vcf'
      };
    try {
        logger.debug(`Sending vcard via Twilio ...`);
        let responseData = await twilio.messages.create(params);
        //logger.debug(`Received response data from Twilio: ${JSON.stringify(responseData)}`);
        logger.debug(`Twilio sid: ${responseData.sid}, errorMessage: ${responseData.errorMessage}`);
    }
    catch (err) {
        logger.error(`Error from Twilio: ${err}`);
    }

    // log outgoing message to dashbot
    try
    {
        await DashbotLib.logOutgoingToDashbot(
            userToken,
            params.body,
            {
                body: params.body,
                from: params.from,
                mediaUrl: params.mediaUrl
            }
        );
    }
    catch (err) {
        logger.error(`Error from Dashbot: ${err}`);
    }
}

async function sendText(phone, userToken, textMsg) {
    const twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

    let params = {
        body: textMsg,
        from: config.TWILIO_FROM_NUMBER,
        to: phone
      };
    try {
        logger.debug(`Sending text via Twilio ...`);
        let responseData = await twilio.messages.create(params);
        //logger.debug(`Received response data from Twilio: ${JSON.stringify(responseData)}`);
        logger.debug(`Twilio sid: ${responseData.sid}, errorMessage: ${responseData.errorMessage}`);
    }
    catch (err) {
        logger.error(`Error from Twilio: ${err}`);
    }

    // log outgoing message to dashbot
    try {
        await DashbotLib.logOutgoingToDashbot(
            userToken,
            params.body,
            {
                body: params.body,
                from: params.from
            }
        );
    }
    catch (err) {
        logger.error(`Error from Dashbot: ${err}`);
    }
}


module.exports = {
    sendVcard,
    sendText
}
