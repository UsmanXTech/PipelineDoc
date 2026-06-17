terraform {
  required_version = ">= 1.0.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 4.0.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.oci_tenancy_ocid
  user_ocid        = var.oci_user_ocid
  fingerprint      = var.oci_fingerprint
  private_key_path = var.oci_private_key_path
  region           = var.oci_region
}

# VCN
resource "oci_core_vcn" "pipelinedoc_vcn" {
  compartment_id = var.oci_compartment_id
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "pipelinedoc-vcn"
  dns_label      = "pipelinedocvcn"
}

# Internet Gateway
resource "oci_core_internet_gateway" "pipelinedoc_ig" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.pipelinedoc_vcn.id
  display_name   = "pipelinedoc-gateway"
  enabled        = true
}

# Route Table
resource "oci_core_route_table" "pipelinedoc_rt" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.pipelinedoc_vcn.id
  display_name   = "pipelinedoc-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.pipelinedoc_ig.id
  }
}

# Security List
resource "oci_core_security_list" "pipelinedoc_sl" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.pipelinedoc_vcn.id
  display_name   = "pipelinedoc-security-list"

  egress_security_rules {
    destination      = "0.0.0.0/0"
    protocol         = "all" # Allow all outbound traffic
    destination_type = "CIDR_BLOCK"
  }

  # SSH
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # API (Port 3000)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 3000
      max = 3000
    }
  }

  # Postgres (Port 5432)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 5432
      max = 5432
    }
  }

  # Redis (Port 6379)
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 6379
      max = 6379
    }
  }
}

# Subnet
resource "oci_core_subnet" "pipelinedoc_subnet" {
  cidr_block        = "10.0.1.0/24"
  compartment_id    = var.oci_compartment_id
  vcn_id            = oci_core_vcn.pipelinedoc_vcn.id
  display_name      = "pipelinedoc-subnet"
  dns_label         = "pdsubnet"
  route_table_id    = oci_core_route_table.pipelinedoc_rt.id
  security_list_ids = [oci_core_security_list.pipelinedoc_sl.id]
}

# OCI Flex Instance (Ampere A1 - 4 OCPUs, 24GB RAM)
resource "oci_core_instance" "pipelinedoc_instance" {
  availability_domain = var.oci_availability_domain
  compartment_id      = var.oci_compartment_id
  shape               = "VM.Standard.A1.Flex"
  display_name        = "pipelinedoc-server"

  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type             = "image"
    source_id               = var.oci_image_id
    boot_volume_size_in_gbs = 50
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.pipelinedoc_subnet.id
    assign_public_ip = true
    hostname_label   = "pipelinedoc"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}

# Additional 50GB Block Volume
resource "oci_core_volume" "pipelinedoc_volume" {
  compartment_id      = var.oci_compartment_id
  availability_domain = var.oci_availability_domain
  size_in_gbs         = 50
  display_name        = "pipelinedoc-data-volume"
}

# Volume Attachment
resource "oci_core_volume_attachment" "pipelinedoc_volume_attachment" {
  attachment_type = "iscsi"
  instance_id     = oci_core_instance.pipelinedoc_instance.id
  volume_id       = oci_core_volume.pipelinedoc_volume.id
}
