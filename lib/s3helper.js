const AWS = require('aws-sdk')
const logger = require('../logger')

module.exports.getAllS3KeysFromPrefix = async function (params) {
  let keys = []

  try {
    const s3 = new AWS.S3();
    logger.debug(`Listing objects from s3://${params.bucket}/${params.s3keyPrefix}`)
    let awsParams = {
        Bucket: params.bucket,
        Delimiter: '/',
        Prefix: params.s3keyPrefix,
        MaxKeys: params.maxKeys ? params.maxKeys : 1000
    }
    if (params.marker) {
      awsParams['Marker'] = params.marker
    }
    if (awsParams['MaxKeys'] < 1000) {
      logger.warn(`MaxKeys limited to ${awsParams['MaxKeys']}`)
    }
    let data = await s3.listObjects(awsParams).promise()
    logger.debug(`${data.Contents.length} keys retrieved`)
    keys.push.apply(keys, data.Contents)
    if (data.IsTruncated) {
      params['marker'] = data.NextMarker
      keys.push.apply(keys, await this.getAllS3KeysFromPrefix(params))
    }
  }
  catch (err) {
    logger.error(`Unexpected error listing objects from s3://${params.bucket}/${params.s3keyPrefix}:`, err)
    throw err
  }
  return keys
}
