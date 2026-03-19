# ============================================
# Null Resource for Worker Node Join
# ============================================

resource "null_resource" "k3s_worker_join" {
  depends_on = [null_resource.k3s_master_install, hcloud_server.k3s_worker]
  
  # Trigger on worker IP change
  triggers = {
    worker_id = hcloud_server.k3s_worker.id
  }
  
  connection {
    type        = "ssh"
    host        = hcloud_server.k3s_worker.ipv4_address
    user        = "root"
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = "5m"
  }
  
  provisioner "remote-exec" {
    inline = [
      "echo 'Waiting for system to be ready...'",
      "cloud-init status --wait || true",
      "apt-get update && apt-get install -y curl",
      "sleep 10",
    ]
  }
}

resource "null_resource" "get_token_and_join" {
  depends_on = [null_resource.k3s_worker_join]
  
  # Get token from master and join worker
  provisioner "local-exec" {
    command = <<-EOT
      # Get token from master
      echo "Getting token from master..."
      TOKEN=$(ssh -o StrictHostKeyChecking=no root@${hcloud_server.k3s_master.ipv4_address} 'cat /var/lib/rancher/k3s/server/node-token')
      
      # Join worker to cluster
      echo "Joining worker to cluster..."
      ssh -o StrictHostKeyChecking=no root@${hcloud_server.k3s_worker.ipv4_address} \
        "curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION='${var.k3s_version}' K3S_URL='https://10.0.1.10:6443' K3S_TOKEN='$TOKEN' sh -"
      
      echo "Worker joined successfully!"
    EOT
  }
}
