# ============================================
# Terraform Outputs
# ============================================

output "master_ip" {
  description = "Public IP of the k3s master node"
  value       = hcloud_server.k3s_master.ipv4_address
}

output "worker_ip" {
  description = "Public IP of the k3s worker node"
  value       = hcloud_server.k3s_worker.ipv4_address
}

output "load_balancer_ip" {
  description = "Public IP of the load balancer (point DNS here)"
  value       = hcloud_load_balancer.ingress.ipv4
}

output "kubeconfig_command" {
  description = "Command to get kubeconfig from master"
  value       = "ssh root@${hcloud_server.k3s_master.ipv4_address} 'cat /etc/rancher/k3s/k3s.yaml' | sed 's/127.0.0.1/${hcloud_server.k3s_master.ipv4_address}/g' > ~/.kube/chessvector-prod.yaml"
}

output "dns_records" {
  description = "DNS records to create"
  value = {
    "chessvector.com"     = hcloud_load_balancer.ingress.ipv4
    "www.chessvector.com" = hcloud_load_balancer.ingress.ipv4
    "api.chessvector.com" = hcloud_load_balancer.ingress.ipv4
  }
}
