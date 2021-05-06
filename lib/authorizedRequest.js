const AWS = require('aws-sdk')
const logger = require('../logger')
const config = require("../config");
const stringNormalizer = require('string-normalizer');
const PhoneTokenService = require('phone-token-service')

module.exports.generateAuthorizedRequestFromPhone = async function (phone, rawApplication) {
  const phoneTokenService = new PhoneTokenService({
      // salt for hashing algorithm 
      tokenHashHmac: config.USERTOKEN_HASH_HMAC,
      // s3 bucket for storing the mapping relationship
      s3bucket: config.AUTHREQ_S3_BUCKET,
      // retrieve country code from ip address via https://ipapi.co/country/
      defaultCountryCode: 'US'
  });
  const userToken = await phoneTokenService.getTokenFromPhone(phone);
  let arid = await generateAuthorizedRequest(userToken, rawApplication);
  return arid;
}

async function generateAuthorizedRequest(userToken, rawApplication) {

    const currentEpochTime = Math.round((new Date).getTime() / 1000);
    const expirePeriodSeconds = config.AUTHREQ_EXPIRE_MINS * 60;
    const expireEpochTime = currentEpochTime + expirePeriodSeconds;

    let authorizedRequest = {
        expireEpoch: expireEpochTime,
        userToken: userToken,
        rawApplication: rawApplication,
        normalizedApplication: stringNormalizer.normalizeString(rawApplication)
    };

    const s3keyPrefix = 'arid';
    let arid = await generateUniqueShortRandomString(10, config.AUTHREQ_S3_BUCKET, s3keyPrefix);
    let s3key = `${s3keyPrefix}/${arid}`;

    try {
        const s3 = new AWS.S3()
        let resp = await s3.putObject({
            Bucket: config.AUTHREQ_S3_BUCKET,
            Key: s3key,
            Body: JSON.stringify(authorizedRequest),
            ContentType: 'application/json'
        }).promise()
  
        logger.trace(`S3 PutObject response for s3://${config.AUTHREQ_S3_BUCKET}/${s3key}:`, resp)
    }
    catch (err) {
        logger.error(`Error uploading to s3://${s3key}: ${err}`);
        throw err;
    }
    return arid;
}

// generates short strings like 'cv2jhsd3pv' that can be used for keys
// not guaranteed to be unique, just random
function generateShortRandomString(numChars) {
    return [...Array(numChars)].map(i=>(~~(Math.random()*36)).toString(36)).join('');
}

async function fileExistsOnS3(s3bucket, s3key) {
    try {
      const s3 = new AWS.S3();
      let metadata = await s3.headObject({
        Bucket: s3bucket,
        Key: s3key
      }).promise()
    }
    catch (err) {
      if (err.statusCode === 404) {
        logger.warn(`Requested file not found for s3://${s3bucket}/${s3key}`)
        return false
      } else {
        logger.error(`Unexpected error testing for file existance of s3://${s3bucket}/${s3key}:`, err)
        throw err
      }
    }
    logger.debug(`Found s3://${s3bucket}/${s3key}`)
    return true
}

// generates a short random string ensured to be unique against other existing
// keys in the provided s3 bucket.  under high enough volume this may not prove
// to guarantee absolute uniqueness, these are not guids.
async function generateUniqueShortRandomString(numChars, s3bucket, s3keyPrefix) {
    const maxAttempts = 10;
    let attempt = 0;
    do {
        attempt++;
        const s = generateShortRandomString(numChars);
        // remove trailing slash from key prefix
        s3keyPrefix =  s3keyPrefix.replace(/\/$/, "");
        const exists = await fileExistsOnS3(s3bucket, `${s3keyPrefix}/${s}`);
        if (!exists) {
            return s;
        }
    } while (attempt < maxAttempts)
    throw new Error('Max attempts exceeded when verifying uniqueness of randomly generated string on S3');
}
