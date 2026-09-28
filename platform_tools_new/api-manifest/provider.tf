terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "5.99.1"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "2.17.0"
    }
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config-k3s"
}

provider "helm" {
  kubernetes {
    config_path = "~/.kube/config-k3s"
  }
}
