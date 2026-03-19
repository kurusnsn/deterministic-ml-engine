# ============================================
# Terraform Configuration for ChessVector
# Phase T: Infrastructure as Code
# ============================================

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
  
  # Optional: Remote state storage
  # backend "s3" {
  #   bucket   = "chessvector-terraform-state"
  #   key      = "prod/terraform.tfstate"
  #   region   = "eu-central-1"
  #   endpoint = "https://fsn1.your-objectstorage.com"
  # }
}

provider "hcloud" {
  token = var.hcloud_token
}
