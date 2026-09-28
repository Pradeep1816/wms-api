terraform {
  backend "s3" {
    region = "eu-central-1"
    endpoints = {
      s3 = "https://nbg1.your-objectstorage.com"
    }
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    use_path_style              = true
  }
}
