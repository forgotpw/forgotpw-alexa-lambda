const AWS = require('aws-sdk')
const config = require('../config')
const logger = require('../logger')
const s3helper = require('./s3helper')
const stringSimilarity = require('string-similarity');
const stringNormalizer = require('string-normalizer');

class ApplicationService {
  constructor() {}

  async findApplication(rawApplication, userToken) {

    const normalizedApplication = stringNormalizer.normalizeString(rawApplication)

    let similarFound = false
    let matchType
    // if exact match simply return (quicker than listing objects on s3)
    let exactMatch = await this.applicationDataExists(
      normalizedApplication,
      userToken)
    if (exactMatch) {
      return {
        normalizedApplication,
        matchType: 'EXACT_FOUND'
      }
    } else {
      logger.debug(`Could not find an exact application match on S3 for '${normalizedApplication}'`)

      // else get a list of all stored application names
      let storedNormalizedApplications = await this.getStoredApplications(userToken)
      if (storedNormalizedApplications.length <= 0) {
        logger.warn(`Did not find any stored applications for ${userToken}`)
      } else {
        // calculate similar % of given application to each stored application name
        let similarities = calculateSimilarities(normalizedApplication, storedNormalizedApplications)
        similarities = similarities.sort(compareSimilar)
        logger.debug(`Top similar applications: ${JSON.stringify(similarities.slice(0, 3))}`)

        if (similarities[0].similarity >= config.MATCH_HIGH_PCT) {
          similarFound = true
          matchType = 'HIGH_MATCH_FOUND'
          logger.info(`High similar match found for ${rawApplication}: ${similarities[0].normalizedApplicationName}`)
        } else if (similarities[0].similarity >= config.MATCH_LOW_PCT) {
          similarFound = true
          matchType = 'LOW_MATCH_FOUND'
          logger.info(`Low similar match found for ${rawApplication}: ${similarities[0].normalizedApplicationName}`)
        } else {
          logger.info(`Did not find similar enough match found for ${rawApplication}, closest match was ${similarities[0].normalizedApplicationName} (${similarities[0].similarity})`)
        }
        if (similarFound) {
          return {
            normalizedApplication: similarities[0].normalizedApplicationName,
            matchType
          }
        }
      }
    }

    return {
      normalizedApplication: null,
      matchType: 'NOTFOUND'
    }

  }

  async applicationDataExists(normalizedApplication, userToken) {
    let s3key = applicationS3Key(normalizedApplication, userToken)

    if (!config.USERDATA_S3_SSEC_KEY || config.USERDATA_S3_SSEC_KEY.length < 32) {
      logger.error("S3 userdata SSE-C encryption key missing!")
    }
    const ssecKey = Buffer.alloc(32, config.USERDATA_S3_SSEC_KEY)

    try {
      const s3 = new AWS.S3();
      // i've seen flakiness with s3 HEAD requests, and since these
      // files are small, just read the whole file
      let metadata = await s3.headObject({
        Bucket: config.USERDATA_S3_BUCKET,
        SSECustomerAlgorithm: 'AES256',
        SSECustomerKey: ssecKey,
        Key: s3key
      }).promise()
    }
    catch (err) {
      if (err.statusCode === 404) {
        logger.warn(`Requested application data not found for s3://${config.USERDATA_S3_BUCKET}/${s3key}`)
        return false
      } else {
        logger.error(`Unexpected error testing for file existance of s3://${config.USERDATA_S3_BUCKET}/${s3key}:`, err)
        throw err
      }
    }
    logger.debug(`Found s3://${config.USERDATA_S3_BUCKET}/${s3key}`)
    return true
  }

  async getStoredApplications(userToken) {
    let s3keyPrefix = userS3KeyPrefix(userToken)
    let applicationKeys = await s3helper.getAllS3KeysFromPrefix({
      bucket: config.USERDATA_S3_BUCKET,
      s3keyPrefix: s3keyPrefix
    })
    // convert the list of keys to application names
    let applications = []
    for (let key of applicationKeys) {
      let application = key.Key.split('/').slice(-1)[0].replace('.json', '')
      applications.push(application)
    }
    return applications
  }

}

function calculateSimilarities(normalizedApplication, storedNormalizedApplications) {
  let similarApplications = []
  for (let app of storedNormalizedApplications) {
    let similarity = stringSimilarity.compareTwoStrings(normalizedApplication, app);
    logger.trace(`Similarity is ${similarity} for ${normalizedApplication}, ${app}`)
    similarApplications.push({
      normalizedApplicationName: app,
      similarity: similarity
    })
  }
  return similarApplications
}

function compareSimilar(a,b) {
  if (a.similarity > b.similarity)
    return -1;
  if (a.similarity < b.similarity)
    return 1;
  return 0;
}

function userS3KeyPrefix(userToken) {
  return `users/${userToken}/data/`
}

function applicationS3Key(normalizedApplication, userToken) {
  return userS3KeyPrefix(userToken) + `${normalizedApplication}.json`
}

module.exports = ApplicationService
