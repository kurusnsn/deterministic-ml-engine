# ============================================
# Variables for ChessVector Infrastructure
# ============================================

variable "hcloud_token" {
  description = "Hetzner Cloud API Token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key for server access"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key for provisioning"
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "nbg1"  # Nuremberg, Germany (switched from fsn1 due to resource availability)
}

variable "server_type" {
  description = "Hetzner server type for k3s nodes"
  type        = string
  default     = "cpx21"  # 3 vCPU, 4GB RAM, 80GB SSD - good starting point
}

variable "k3s_version" {
  description = "K3s version to install"
  type        = string
  default     = "v1.28.5+k3s1"
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "chessvector.com"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}
