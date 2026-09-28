resource "kubernetes_service_v1" "api_service" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = kubernetes_namespace_v1.smw_namespace.metadata[0].name
  }

  spec {
    selector = {
      app = var.app_name
    }

    port {
      port        = var.api_port
      target_port = var.api_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
} 