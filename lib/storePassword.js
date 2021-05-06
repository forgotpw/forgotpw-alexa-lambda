const logger = require('../logger');
const authorizedRequest = require('./lib/authorizedRequest');
const config = require('../config');
const PhoneTokenService = require('phone-token-service')

async function retrievePasswordController(intentRequest) {
    const sessionAttributes = intentRequest.sessionAttributes;
    const slots = intentRequest.currentIntent.slots;
    const rawApplication = slots.Application;
    const phone = intentRequest.userId;

    const phoneTokenService = new PhoneTokenService({
        tokenHashHmac: config.USERTOKEN_HASH_HMAC,
        s3bucket: config.USERTOKENS_S3_BUCKET,
        defaultCountryCode: 'US'
      })
    const userToken = await phoneTokenService.getTokenFromPhone(phone);
  
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
            url: `https://${subdomain}.forgotpw.com/#/get?arid=${arid}`
        }
        msg = Mustache.render(template, viewData);
    }
    
    return lexResponse(
        sessionAttributes,
        'Fulfilled',
        msg
    );
}
