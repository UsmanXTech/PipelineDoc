variable "oci_tenancy_ocid" {
  type        = string
  description = "OCI Tenancy OCID"
}

variable "oci_user_ocid" {
  type        = string
  description = "OCI User OCID"
}

variable "oci_fingerprint" {
  type        = string
  description = "OCI Fingerprint"
}

variable "oci_private_key_path" {
  type        = string
  description = "Path to OCI private key"
}

variable "oci_region" {
  type        = string
  description = "OCI Region"
  default     = "us-ashburn-1"
}

variable "oci_compartment_id" {
  type        = string
  description = "OCI Compartment OCID"
}

variable "oci_availability_domain" {
  type        = string
  description = "OCI Availability Domain"
}

variable "oci_image_id" {
  type        = string
  description = "OCI Ubuntu Image OCID"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH Public Key content for instance access"
}
