# ============================================
# Network Configuration
# ============================================

resource "hcloud_network" "k3s_network" {
  name     = "chessvector-network"
  ip_range = "10.0.0.0/16"
}

resource "hcloud_network_subnet" "k3s_subnet" {
  network_id   = hcloud_network.k3s_network.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.0.1.0/24"
}

# ============================================
# SSH Key
# ============================================

resource "hcloud_ssh_key" "default" {
  name       = "chessvector-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# ============================================
# Firewall
# ============================================

resource "hcloud_firewall" "k3s" {
  name = "chessvector-firewall"
  
  # SSH
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  # HTTP
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  # HTTPS
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  # Kubernetes API
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "6443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  # NodePort range (for testing)
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "30000-32767"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Allow all internal traffic from the private network
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "any"
    source_ips = ["10.0.0.0/16"]
  }
  rule {
    direction = "in"
    protocol  = "udp"
    port      = "any"
    source_ips = ["10.0.0.0/16"]
  }
  rule {
    direction = "in"
    protocol  = "icmp"
    source_ips = ["10.0.0.0/16"]
  }
}

# ============================================
# K3s Master Node
# ============================================

resource "hcloud_server" "k3s_master" {
  name        = "chessvector-master"
  image       = "ubuntu-22.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.default.id]
  
  firewall_ids = [hcloud_firewall.k3s.id]
  
  network {
    network_id = hcloud_network.k3s_network.id
    ip         = "10.0.1.10"
  }
  
  labels = {
    role        = "master"
    environment = var.environment
  }
  
  # Basic user_data - k3s will be installed via remote-exec provisioner
  user_data = <<-EOF
    #!/bin/bash
    set -e
    
    # Update system
    apt-get update && apt-get upgrade -y
    
    # Install prerequisites
    apt-get install -y curl
    
    echo "System updated and ready for k3s installation"
  EOF

  depends_on = [hcloud_network_subnet.k3s_subnet]
}

# Install k3s after server is created (so we know the IP)
resource "null_resource" "k3s_master_install" {
  depends_on = [hcloud_server.k3s_master]
  
  triggers = {
    master_id = hcloud_server.k3s_master.id
  }
  
  connection {
    type        = "ssh"
    host        = hcloud_server.k3s_master.ipv4_address
    user        = "root"
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = "5m"
  }
  
  provisioner "remote-exec" {
    inline = [
      "echo 'Waiting for cloud-init to complete...'",
      "cloud-init status --wait || true",
      "sleep 10",
      
      "echo 'Installing k3s...'",
      "curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION='${var.k3s_version}' sh -s - server --disable traefik --disable servicelb --write-kubeconfig-mode 644 --node-name chessvector-master --tls-san ${hcloud_server.k3s_master.ipv4_address} --tls-san api.${var.domain}",
      
      "echo 'Waiting for k3s to be ready...'",
      "sleep 30",
      
      "echo 'Installing Helm...'",
      "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash",
      
      "echo 'K3s master setup complete!'",
    ]
  }
}

# ============================================
# K3s Worker Node
# ============================================

resource "hcloud_server" "k3s_worker" {
  name        = "chessvector-worker-1"
  image       = "ubuntu-22.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.default.id]
  
  firewall_ids = [hcloud_firewall.k3s.id]
  
  network {
    network_id = hcloud_network.k3s_network.id
    ip         = "10.0.1.11"
  }
  
  labels = {
    role        = "worker"
    environment = var.environment
  }
  
  # Worker joins after master is ready
  depends_on = [hcloud_server.k3s_master]
}

# ============================================
# Load Balancer
# ============================================

resource "hcloud_load_balancer" "ingress" {
  name               = "chessvector-lb"
  load_balancer_type = "lb11"  # Cheapest option
  location           = var.location
  
  labels = {
    environment = var.environment
  }
}

resource "hcloud_load_balancer_network" "ingress" {
  load_balancer_id = hcloud_load_balancer.ingress.id
  network_id       = hcloud_network.k3s_network.id
  ip               = "10.0.1.100"
}

resource "hcloud_load_balancer_target" "master" {
  type             = "server"
  load_balancer_id = hcloud_load_balancer.ingress.id
  server_id        = hcloud_server.k3s_master.id
  use_private_ip   = true
  
  depends_on = [hcloud_load_balancer_network.ingress]
}

resource "hcloud_load_balancer_target" "worker" {
  type             = "server"
  load_balancer_id = hcloud_load_balancer.ingress.id
  server_id        = hcloud_server.k3s_worker.id
  use_private_ip   = true
  
  depends_on = [hcloud_load_balancer_network.ingress]
}

# HTTP Service
resource "hcloud_load_balancer_service" "http" {
  load_balancer_id = hcloud_load_balancer.ingress.id
  protocol         = "tcp"
  listen_port      = 80
  destination_port = 80
  proxyprotocol    = true
  
  health_check {
    protocol = "tcp"
    port     = 80
    interval = 10
    timeout  = 5
    retries  = 3
  }
}

# HTTPS Service
resource "hcloud_load_balancer_service" "https" {
  load_balancer_id = hcloud_load_balancer.ingress.id
  protocol         = "tcp"
  listen_port      = 443
  destination_port = 443
  proxyprotocol    = true
  
  health_check {
    protocol = "tcp"
    port     = 443
    interval = 10
    timeout  = 5
    retries  = 3
  }
}
