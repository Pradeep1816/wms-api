resource "kubernetes_namespace_v1" "smw_namespace" {
  metadata {
    name = var.namespace
  }
} 