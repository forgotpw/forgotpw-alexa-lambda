# ForgotPW Alexa Lambda

**NOTE: Rosa (www.rosa.bot) is the new name for ForgotPW**

Alexa skill for retrieving passwords by voice to be delivered by SMS text message.

## Setup

### Setup - Create Amazon Developer account and OAuth2 Credentials

This guide was followed to setup a Amazon Developer account (https://developer.amazon.com) and setup Login with Amazon with OAuth2 credentials:

https://serverless.com/blog/how-to-manage-your-alexa-skills-with-serverless/

Two security profiles were created, one for "ForgotPW" (prod) and another for "ForgotPW Dev".

*NOTE*: The guide on serverless.com seems to specify the incorrect values for Allowed Origins and Allowed Return URLs when setting up the security profile.  The following values worked (using serverless 1.41.1):

Allowed Origins:
http://127.0.0.1:9090
Allowed Return URLs:
http://127.0.0.1:9090/cb

### Setup - Apply Secret SSM values

This relies on secrets which were created externally with Terraform in the private secrets repo.  This includes the follwing SSM parameters that must be applied:

```
/fpw/AMAZON_VENDOR_ID
/fpw/AMAZON_CLIENT_ID
/fpw/AMAZON_CLIENT_SECRET
/fpw/ALEXA_SKILL_ID
```

### Setup - Apply Terraform

Terraform in this git repo contains SSM parameters that are necessary for the serverless.yml template, including installation of the sls plugins.  Because of this you will need to apply this terraform before any other steps.

### Setup - Install SLS Plugins

```shell
# The below commands rely on iam-starter (iamx), install via:
pip install iam-starter

export AWS_ENV="dev" && export PROFILE="fpw$AWS_ENV"
iamx \
    --profile $PROFILE \
    --command sls plugin install -n serverless-alexa-skills
```

### Setup - Create Alexa Skill

```shell
# apply terraform to create SSM parameters
cd ./terraform/$AWS_ENV
terraform apply

export AWS_ENV="dev" && export PROFILE="fpw$AWS_ENV"

iamx --profile $PROFILE --command sls alexa auth
iamx --profile $PROFILE \
    --command "sls alexa create --name 'Rosa' --locale en-US --type custom"
```

The above command will output the Alexa Skill ID.  Place this value in the secure SSM parameter `/fpw/ALEXA_SKILL_ID` in the private secrets git repo.


### Setup - Update Manifest

```shell
export AWS_ENV="dev" && export PROFILE="fpw$AWS_ENV"
export AWS_ACCOUNTID=$( \
    aws sts get-caller-identity \
        --query "Account" \
        --output text \
        --profile $PROFILE)
iamx --profile $PROFILE --command sls alexa update
```

### Setup - Upload interaction model

Login to the Alexa Developer Console, enter the skill, select Interaction Model, and upload skill.json into the console.

### Deploy the Lambda Function

```shell
export AWS_ENV="dev" && export PROFILE="fpw$AWS_ENV"
export AWS_ACCOUNTID=$( \
    aws sts get-caller-identity \
        --query "Account" \
        --output text \
        --profile $PROFILE)
iam-starter \
    --profile $PROFILE \
    --command sls deploy --verbose
```

## Deploy the Lambda Function by method of Docker

(More compact, more reliable, but slower deploy process)

The deploy environment will install production dependencies only to keep the package size within Lambda's 250MB limit.  Be sure to re-build the docker container each time.  Requires pip install iam-docker-run.

```shell
export AWS_ENV="dev" && export PROFILE="fpw$AWS_ENV"
export AWS_ACCOUNTID=$( \
    aws sts get-caller-identity \
        --query "Account" \
        --output text \
        --profile $PROFILE)
# must re-build docker container each deploy!
docker build -f Dockerfile.deploy -t forgotpw-alexa-lambda:deploy .
iam-docker-run \
    --interactive \
    --profile $PROFILE \
    -e AWS_ENV \
    -e AWS_ACCOUNTID \
    --image forgotpw-alexa-lambda:deploy
```

# License

GNU General Public License v3.0

See [LICENSE](LICENSE.txt) to see the full text.
