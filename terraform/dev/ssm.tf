resource "aws_ssm_parameter" "ALEXA_SKILL_NAME" {
  name  = "/fpw/ALEXA_SKILL_NAME"
  type  = "String"
  value = "Rosa"
}
