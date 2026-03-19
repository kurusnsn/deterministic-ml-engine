package kubernetes

# ============================================
# DENY RULES (Block Deployment)
# ============================================

# Deny containers without resource limits
deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.resources.limits
  msg := sprintf("Container '%s' in Deployment '%s' must have resource limits", [container.name, input.metadata.name])
}

# Deny containers without resource requests
deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.resources.requests
  msg := sprintf("Container '%s' in Deployment '%s' must have resource requests", [container.name, input.metadata.name])
}

# Deny privileged containers
deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  container.securityContext.privileged == true
  msg := sprintf("Container '%s' in Deployment '%s' must not be privileged", [container.name, input.metadata.name])
}

# Deny :latest tag in production namespaces
deny[msg] {
  input.kind == "Deployment"
  input.metadata.namespace == "ostadchess-prod"
  container := input.spec.template.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("Container '%s' in Deployment '%s' uses :latest tag in production - use specific version", [container.name, input.metadata.name])
}

# Deny hostNetwork
deny[msg] {
  input.kind == "Deployment"
  input.spec.template.spec.hostNetwork == true
  msg := sprintf("Deployment '%s' must not use hostNetwork", [input.metadata.name])
}

# Deny hostPID
deny[msg] {
  input.kind == "Deployment"
  input.spec.template.spec.hostPID == true
  msg := sprintf("Deployment '%s' must not use hostPID", [input.metadata.name])
}

# ============================================
# WARN RULES (Recommendations)
# ============================================

# Warn on missing readiness probe
warn[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.readinessProbe
  msg := sprintf("Container '%s' in Deployment '%s' should have a readiness probe", [container.name, input.metadata.name])
}

# Warn on missing liveness probe
warn[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.livenessProbe
  msg := sprintf("Container '%s' in Deployment '%s' should have a liveness probe", [container.name, input.metadata.name])
}

# Warn on containers running as root
warn[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.securityContext.runAsNonRoot
  msg := sprintf("Container '%s' in Deployment '%s' should run as non-root", [container.name, input.metadata.name])
}

# Warn on missing namespace
warn[msg] {
  input.kind == "Deployment"
  not input.metadata.namespace
  msg := sprintf("Deployment '%s' should specify a namespace", [input.metadata.name])
}

# Warn on missing security context
warn[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.securityContext
  msg := sprintf("Container '%s' in Deployment '%s' should have a securityContext", [container.name, input.metadata.name])
}

# Warn if replicas < 2 in production
warn[msg] {
  input.kind == "Deployment"
  input.metadata.namespace == "ostadchess-prod"
  input.spec.replicas < 2
  msg := sprintf("Deployment '%s' in production should have at least 2 replicas for HA", [input.metadata.name])
}

# Warn on missing image pull policy
warn[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.imagePullPolicy
  msg := sprintf("Container '%s' in Deployment '%s' should specify imagePullPolicy", [container.name, input.metadata.name])
}
