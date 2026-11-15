CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"action" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"doc_no" text,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"diff" jsonb
);
--> statement-breakpoint
CREATE TABLE "change_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"object_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"owner_type" text,
	"owner_id" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"prefix" text NOT NULL,
	"period" text NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "number_sequences_prefix_period_pk" PRIMARY KEY("prefix","period")
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"type" text NOT NULL,
	"parent_id" uuid,
	"path" text NOT NULL,
	"leader_id" uuid,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "orgs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"device" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "role_customers" (
	"role_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	CONSTRAINT "role_customers_role_id_customer_id_pk" PRIMARY KEY("role_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"type" text NOT NULL,
	"data_scope" text NOT NULL,
	"all_customers" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_params" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"name_en" text,
	"employee_no" text,
	"password_hash" text NOT NULL,
	"primary_org_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"locale" text DEFAULT 'zh-CN' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "base_machines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"base_id" uuid NOT NULL,
	"needle_type_id" uuid NOT NULL,
	"machine_count" integer DEFAULT 0 NOT NULL,
	"daily_output_per_machine" numeric(14, 3) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"country" text DEFAULT 'CN' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bases_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"logo_text" text,
	"settlement_entity" text,
	"payment_terms_days" integer DEFAULT 60 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"ai_allowed" boolean DEFAULT true NOT NULL,
	"owner_org_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "dictionaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"label" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"rate_to_cny" numeric(9, 4) NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"base_id" uuid NOT NULL,
	"legal_entity" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "factories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "forwarders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "forwarders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"spec" text,
	"unit" text NOT NULL,
	"unit_price" numeric(18, 4),
	"currency" text DEFAULT 'CNY' NOT NULL,
	"supplier" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "materials_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "needle_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"needles" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "needle_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"code" text PRIMARY KEY NOT NULL,
	"label" jsonb NOT NULL,
	"start_date" date,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "test_agencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"contact" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "test_agencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_flow_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid
);
--> statement-breakpoint
CREATE TABLE "customer_flows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"current_version_id" uuid,
	"draft" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "customer_flows_customerId_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "rule_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"customer_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"params_schema" jsonb,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "service_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"department" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"has_page" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "service_modules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "handover_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"style_id" uuid NOT NULL,
	"status" text NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tech_pack_file_id" uuid,
	"qrs_library_id" uuid,
	"frozen_at" timestamp with time zone,
	"completed_by" uuid,
	"snapshot" jsonb,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "handover_packages_docNo_unique" UNIQUE("doc_no"),
	CONSTRAINT "handover_packages_styleId_unique" UNIQUE("style_id")
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"customer_id" uuid,
	"file_id" uuid,
	"content" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plannings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"style_id" uuid,
	"style_no" text,
	"season_code" text,
	"status" text NOT NULL,
	"name_zh" text,
	"name_en" text,
	"category" text,
	"sub_category" text,
	"default_size" text,
	"size_range" text,
	"supplier" text,
	"buyer_name" text,
	"designer" text,
	"needle_count" text,
	"sock_weight" text,
	"required_sample_date" date,
	"product_attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extraction" jsonb,
	"source_file_id" uuid,
	"source_filename" text,
	"image_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recognition_error" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"archived_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plannings_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "quote_cost_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"spec" text,
	"quantity" numeric(14, 3),
	"unit_price" numeric(18, 4),
	"amount" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"doc_no" text NOT NULL,
	"kind" text NOT NULL,
	"round_no" integer NOT NULL,
	"price_cny" numeric(18, 4) NOT NULL,
	"price_usd" numeric(18, 4) NOT NULL,
	"fx" numeric(9, 4) NOT NULL,
	"quantity" integer NOT NULL,
	"strategy_id" uuid,
	"margin" numeric(9, 4) NOT NULL,
	"guardrail_passed" boolean NOT NULL,
	"diff_to_target_usd" numeric(18, 4),
	"status" text NOT NULL,
	"quoted_by" uuid,
	"quoted_at" timestamp with time zone,
	"override_approved_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quote_rounds_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "quote_strategies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"method" text DEFAULT 'MARKUP' NOT NULL,
	"loss_rate" numeric(9, 4) DEFAULT 0 NOT NULL,
	"overhead_rate" numeric(9, 4) DEFAULT 0 NOT NULL,
	"markup_rate" numeric(9, 4) DEFAULT 0 NOT NULL,
	"target_margin" numeric(9, 4) DEFAULT 0 NOT NULL,
	"guardrail" numeric(9, 4) DEFAULT 0 NOT NULL,
	"locked_fx" numeric(9, 4) DEFAULT 7 NOT NULL,
	"moq" integer DEFAULT 0 NOT NULL,
	"small_order_uplift" numeric(9, 4) DEFAULT 0 NOT NULL,
	"sku_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quote_strategies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"style_id" uuid NOT NULL,
	"factory_id" uuid,
	"moq" integer,
	"cost_total" numeric(18, 4),
	"cost_breakdown" jsonb,
	"target_price_usd" numeric(18, 4),
	"target_fx" numeric(9, 4),
	"target_source" text,
	"target_date" date,
	"strategy_id" uuid,
	"status" text NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_library" (
	"id" uuid PRIMARY KEY NOT NULL,
	"style_id" uuid NOT NULL,
	"round_id" uuid,
	"kind" text NOT NULL,
	"location" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'IN_STOCK' NOT NULL,
	"note" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sample_id" uuid NOT NULL,
	"material_name" text NOT NULL,
	"spec" text,
	"quantity" numeric(14, 3),
	"unit" text,
	"arrival_date" date,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"courier" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sample_id" uuid NOT NULL,
	"round_no" integer NOT NULL,
	"round_type" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rework_count" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"approved_at" timestamp with time zone,
	"approval_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"recipient_id" uuid,
	"method" text NOT NULL,
	"courier" text,
	"tracking_no" text,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"status" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sample_shipments_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "sample_stage_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"round_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"duration_hours" numeric(14, 3),
	"location" text,
	"operator_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"style_id" uuid NOT NULL,
	"planning_id" uuid,
	"product_code" text,
	"factory_id" uuid,
	"team_org_id" uuid,
	"location" text,
	"colorway" text,
	"size" text,
	"due_date" date,
	"customer_ref" text,
	"brief_translation" text,
	"yarn_config" text,
	"craft_notes" text,
	"sample_notes" text,
	"cost_status" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "samples_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "styles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"style_no" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_en" text,
	"category" text,
	"sub_category" text,
	"season_code" text,
	"product_code" text,
	"image_file_id" uuid,
	"color_a" text,
	"color_b" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_report_links" (
	"report_id" uuid NOT NULL,
	"style_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_report_links_report_id_style_id_pk" PRIMARY KEY("report_id","style_id")
);
--> statement-breakpoint
CREATE TABLE "test_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"agency_report_no" text NOT NULL,
	"agency_id" uuid,
	"style_id" uuid NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text NOT NULL,
	"issued_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"file_id" uuid,
	"reuse_key" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "test_reports_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "test_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"style_id" uuid NOT NULL,
	"customer_po" text,
	"color_size" text,
	"stage" text NOT NULL,
	"entrust" text,
	"agency_id" uuid,
	"service_level" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"standard" text,
	"sample_qty" integer,
	"sample_site" text,
	"sent_date" date,
	"lab_received_date" date,
	"due_date" date,
	"completed_date" date,
	"tracking_no" text,
	"sender_id" uuid,
	"factory_id" uuid,
	"season_code" text,
	"status" text NOT NULL,
	"result" text,
	"failed_items" text,
	"reused_report_id" uuid,
	"report_id" uuid,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "test_requests_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audit_id" uuid NOT NULL,
	"item" text NOT NULL,
	"severity" text NOT NULL,
	"corrective_action" text,
	"due_date" date,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid NOT NULL,
	"forwarder_id" uuid,
	"carrier" text,
	"vessel" text,
	"bl_no" text,
	"etd" date,
	"eta" date,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"note" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bookings_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "capacity_ledger_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_no" integer NOT NULL,
	"label" text NOT NULL,
	"as_of_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "capacity_ledger_versions_versionNo_unique" UNIQUE("version_no")
);
--> statement-breakpoint
CREATE TABLE "capacity_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"ledger" text NOT NULL,
	"base_id" uuid NOT NULL,
	"needle_type_id" uuid,
	"process" text,
	"lead_days" integer,
	"available_days" integer,
	"machine_count" integer,
	"daily_output" numeric(14, 3),
	"cumulative_capacity" numeric(14, 3),
	"unproduced_qty" numeric(14, 3),
	"spare_capacity" numeric(14, 3),
	"spare_rate" numeric(9, 4),
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid NOT NULL,
	"style_id" uuid,
	"customer_sku" text,
	"size" text,
	"pairs" integer NOT NULL,
	"pairs_per_carton" integer NOT NULL,
	"carton_count" integer NOT NULL,
	"carton_range" text,
	"pack_due_date" date,
	"status" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cartons_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "collection_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receivable_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"result" text NOT NULL,
	"note" text,
	"next_follow_up" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"po_no" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"revision_date" date,
	"channel" text,
	"po_type" text,
	"product_line" text,
	"season_code" text,
	"style_type" text,
	"trade_term" text,
	"payment_terms" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"fob_amount" numeric(18, 4),
	"buyer_entity" text,
	"origin" text,
	"order_date" date,
	"customer_due_date" date NOT NULL,
	"factory_reply_date" date,
	"delay_days" integer,
	"factory_id" uuid,
	"factory_entity" text,
	"transport_mode" text,
	"destination" text,
	"total_units" integer,
	"total_pairs" integer DEFAULT 0 NOT NULL,
	"merchandiser_id" uuid,
	"status" text NOT NULL,
	"po_terms" text,
	"note" text,
	"source_file_id" uuid,
	"extraction" jsonb,
	"rule_check" jsonb,
	"flow_version_id" uuid,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"factory_id" uuid NOT NULL,
	"audit_type" text NOT NULL,
	"planned_date" date,
	"actual_date" date,
	"auditor" text,
	"result" text,
	"score" numeric(9, 4),
	"status" text NOT NULL,
	"note" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "factory_audits_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "factory_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"reply_date" date NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inspection_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"operator_id" uuid
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid NOT NULL,
	"style_id" uuid,
	"color" text,
	"stage" text NOT NULL,
	"round_no" integer DEFAULT 1 NOT NULL,
	"factory_id" uuid,
	"planned_date" date,
	"actual_date" date,
	"planned_ex_factory" date,
	"method" text,
	"inspector" text,
	"channel" text,
	"aql" text,
	"granularity" text,
	"order_qty" integer,
	"carton_count" integer,
	"production_rate" numeric(9, 4),
	"packing_rate" numeric(9, 4),
	"planned_sample_qty" integer,
	"actual_sample_qty" integer,
	"defect_qty" integer,
	"defect_rate" numeric(9, 4),
	"preconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text,
	"defect_note" text,
	"corrective_action" text,
	"status" text NOT NULL,
	"released_at" timestamp with time zone,
	"release_check" jsonb,
	"concession" boolean DEFAULT false NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inspections_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_no" text NOT NULL,
	"order_id" uuid,
	"shipment_id" uuid,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"issued_date" date NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "invoices_invoiceNo_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "ledger_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ledger" text NOT NULL,
	"name" text NOT NULL,
	"frequency" text NOT NULL,
	"owner_id" uuid,
	"current_version" text,
	"last_updated_at" timestamp with time zone,
	"next_due_at" date,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ledger_tasks_ledger_unique" UNIQUE("ledger")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"style_id" uuid NOT NULL,
	"color" text,
	"size" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4)
);
--> statement-breakpoint
CREATE TABLE "order_stage_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_id" uuid,
	"operator_name" text
);
--> statement-breakpoint
CREATE TABLE "packaging_plan_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"customer_confirmed" boolean DEFAULT false NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packaging_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid,
	"title" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"method" text,
	"pairs_per_carton" integer,
	"carton_size" text,
	"carton_type" text,
	"strength" text,
	"shipping_mark" text,
	"mark_position" text,
	"size_sticker" text,
	"seal_sticker" text,
	"inner_bag" text,
	"tape" text,
	"destination" text,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "packaging_plans_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "po_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"factory_id" uuid,
	"report_date" date NOT NULL,
	"knitted_pairs" integer DEFAULT 0 NOT NULL,
	"packed_pairs" integer DEFAULT 0 NOT NULL,
	"completion_rate" numeric(9, 4),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"material_id" uuid,
	"name" text NOT NULL,
	"spec" text,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(18, 4),
	"received_qty" numeric(14, 3) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid,
	"sample_id" uuid,
	"supplier" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"ordered_at" date NOT NULL,
	"promised_date" date,
	"note" text,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "purchase_orders_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"received_at" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receivable_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"received_at" date NOT NULL,
	"method" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"settlement_entity" text,
	"source_type" text NOT NULL,
	"source_no" text,
	"order_id" uuid,
	"shipment_id" uuid,
	"invoice_id" uuid,
	"type" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"due_date" date NOT NULL,
	"received_amount" numeric(18, 4) DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"missing_data" boolean DEFAULT false NOT NULL,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "receivables_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"planned_at" date,
	"actual_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"order_id" uuid NOT NULL,
	"booking_id" uuid,
	"style_id" uuid,
	"transport_mode" text,
	"destination" text,
	"carrier_text" text,
	"bl_no" text,
	"etd" date,
	"eta" date,
	"carton_count" integer,
	"pairs" integer,
	"gross_weight" numeric(14, 3),
	"factory_id" uuid,
	"season_code" text,
	"status" text NOT NULL,
	"signed_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "shipments_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board" text NOT NULL,
	"scope_key" text NOT NULL,
	"period" text NOT NULL,
	"summary" text NOT NULL,
	"items" jsonb NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"scope_key" text NOT NULL,
	"period" text NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_state_snapshots" (
	"order_id" uuid NOT NULL,
	"node_code" text NOT NULL,
	"state" text NOT NULL,
	"entered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"assignee_id" uuid,
	"blocked_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_state_snapshots_order_id_node_code_pk" PRIMARY KEY("order_id","node_code")
);
--> statement-breakpoint
CREATE TABLE "patrol_hits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"last_run_id" uuid NOT NULL,
	"module" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_no" text,
	"target_name" text,
	"light" text NOT NULL,
	"severity" text NOT NULL,
	"message" jsonb NOT NULL,
	"overdue_days" integer DEFAULT 0 NOT NULL,
	"assignee_id" uuid,
	"customer_id" uuid,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"fingerprint" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "patrol_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"module" text NOT NULL,
	"rule_type" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"target_type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"severity" text NOT NULL,
	"assignee_role" text NOT NULL,
	"yellow_window_days" integer DEFAULT 2 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"customer_ids" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "patrol_rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "patrol_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"rule_count" integer DEFAULT 0 NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"red_count" integer DEFAULT 0 NOT NULL,
	"yellow_count" integer DEFAULT 0 NOT NULL,
	"green_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by" uuid,
	CONSTRAINT "patrol_runs_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "sync_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"batch_no" text NOT NULL,
	"object" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"success" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"customer_id" uuid,
	"protocol" text NOT NULL,
	"base_url" text,
	"credential" jsonb,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sync_endpoints_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sync_links" (
	"endpoint_id" uuid NOT NULL,
	"object" text NOT NULL,
	"local_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_links_endpoint_id_object_local_id_pk" PRIMARY KEY("endpoint_id","object","local_id")
);
--> statement-breakpoint
CREATE TABLE "sync_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"object" text NOT NULL,
	"direction" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_maps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"batch_id" uuid,
	"record_key" text NOT NULL,
	"field" text,
	"error_type" text,
	"error_message" text,
	"suggestion" text,
	"payload" jsonb,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"success" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operator_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"name" text NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"mapping_id" uuid,
	"customer_id" uuid,
	"object" text NOT NULL,
	"direction" text NOT NULL,
	"mode" text NOT NULL,
	"trigger" text NOT NULL,
	"frequency" text,
	"interval_minutes" integer,
	"owner_id" uuid,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_status" text,
	"watermark" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sync_tasks_docNo_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"doc_type" text,
	"doc_id" text,
	"doc_no" text,
	"link" text,
	"customer_id" uuid,
	"assignee_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"fingerprint" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_at_index" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_logs_object_type_object_id_index" ON "audit_logs" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_index" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "change_snapshots_object_type_object_id_index" ON "change_snapshots" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "domain_events_processed_at_index" ON "domain_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_id_index" ON "domain_events" USING btree ("id");--> statement-breakpoint
CREATE INDEX "files_owner_type_owner_id_index" ON "files" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_at_index" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "orgs_parent_id_index" ON "orgs" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "orgs_path_index" ON "orgs" USING btree ("path");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_index" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_index" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_index" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "base_machines_base_id_needle_type_id_index" ON "base_machines" USING btree ("base_id","needle_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_type_code_index" ON "dictionaries" USING btree ("type","code");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_currency_effective_date_index" ON "exchange_rates" USING btree ("currency","effective_date");--> statement-breakpoint
CREATE INDEX "factories_base_id_index" ON "factories" USING btree ("base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_flow_versions_customer_id_version_no_index" ON "customer_flow_versions" USING btree ("customer_id","version_no");--> statement-breakpoint
CREATE INDEX "rule_packs_kind_customer_id_index" ON "rule_packs" USING btree ("kind","customer_id");--> statement-breakpoint
CREATE INDEX "service_items_module_id_index" ON "service_items" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "handover_packages_owner_id_org_id_customer_id_index" ON "handover_packages" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "kb_documents_kind_customer_id_index" ON "kb_documents" USING btree ("kind","customer_id");--> statement-breakpoint
CREATE INDEX "plannings_status_index" ON "plannings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plannings_owner_id_org_id_customer_id_index" ON "plannings" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "plannings_style_id_index" ON "plannings" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "quote_cost_items_quote_id_index" ON "quote_cost_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_rounds_quote_id_index" ON "quote_rounds" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_style_id_index" ON "quotes" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "quotes_owner_id_org_id_customer_id_index" ON "quotes" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "sample_library_style_id_index" ON "sample_library" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "sample_materials_sample_id_index" ON "sample_materials" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX "sample_recipients_customer_id_index" ON "sample_recipients" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_rounds_sample_id_round_no_index" ON "sample_rounds" USING btree ("sample_id","round_no");--> statement-breakpoint
CREATE INDEX "sample_rounds_status_index" ON "sample_rounds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sample_shipments_owner_id_org_id_customer_id_index" ON "sample_shipments" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "sample_stage_logs_round_id_index" ON "sample_stage_logs" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "samples_style_id_index" ON "samples" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "samples_owner_id_org_id_customer_id_index" ON "samples" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "styles_customer_id_style_no_index" ON "styles" USING btree ("customer_id","style_no");--> statement-breakpoint
CREATE INDEX "styles_owner_id_org_id_customer_id_index" ON "styles" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "test_reports_style_id_index" ON "test_reports" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "test_reports_valid_until_index" ON "test_reports" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "test_requests_style_id_index" ON "test_requests" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "test_requests_status_index" ON "test_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "test_requests_owner_id_org_id_customer_id_index" ON "test_requests" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "audit_findings_audit_id_index" ON "audit_findings" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "bookings_order_id_index" ON "bookings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "capacity_rows_version_id_ledger_index" ON "capacity_rows" USING btree ("version_id","ledger");--> statement-breakpoint
CREATE INDEX "cartons_order_id_index" ON "cartons" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "collection_logs_receivable_id_index" ON "collection_logs" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_orders_customer_id_po_no_index" ON "customer_orders" USING btree ("customer_id","po_no");--> statement-breakpoint
CREATE INDEX "customer_orders_owner_id_org_id_customer_id_index" ON "customer_orders" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "customer_orders_status_customer_due_date_index" ON "customer_orders" USING btree ("status","customer_due_date");--> statement-breakpoint
CREATE INDEX "factory_audits_factory_id_index" ON "factory_audits" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "factory_audits_status_index" ON "factory_audits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_replies_order_id_version_no_index" ON "factory_replies" USING btree ("order_id","version_no");--> statement-breakpoint
CREATE INDEX "inspection_logs_inspection_id_index" ON "inspection_logs" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "inspections_order_id_index" ON "inspections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inspections_status_index" ON "inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inspections_owner_id_org_id_customer_id_index" ON "inspections" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_order_id_index" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_id_index" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_style_id_index" ON "order_lines" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "order_stage_logs_order_id_index" ON "order_stage_logs" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "packaging_plan_versions_plan_id_version_no_index" ON "packaging_plan_versions" USING btree ("plan_id","version_no");--> statement-breakpoint
CREATE INDEX "packaging_plans_order_id_index" ON "packaging_plans" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "packaging_plans_owner_id_org_id_customer_id_index" ON "packaging_plans" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "po_revisions_order_id_revision_index" ON "po_revisions" USING btree ("order_id","revision");--> statement-breakpoint
CREATE INDEX "production_progress_order_id_index" ON "production_progress" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_id_index" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_order_id_index" ON "purchase_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_promised_date_index" ON "purchase_orders" USING btree ("status","promised_date");--> statement-breakpoint
CREATE INDEX "purchase_receipts_purchase_id_index" ON "purchase_receipts" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "receipts_receivable_id_index" ON "receipts" USING btree ("receivable_id");--> statement-breakpoint
CREATE INDEX "receivables_status_due_date_index" ON "receivables" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "receivables_owner_id_org_id_customer_id_index" ON "receivables" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_id_index" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_order_id_index" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_index" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipments_owner_id_org_id_customer_id_index" ON "shipments" USING btree ("owner_id","org_id","customer_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_id_updated_at_index" ON "ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_id_index" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_created_at_index" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "diagnoses_board_scope_key_period_index" ON "diagnoses" USING btree ("board","scope_key","period");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshots_metric_scope_key_period_index" ON "metric_snapshots" USING btree ("metric","scope_key","period");--> statement-breakpoint
CREATE INDEX "node_state_snapshots_node_code_state_index" ON "node_state_snapshots" USING btree ("node_code","state");--> statement-breakpoint
CREATE INDEX "patrol_hits_status_light_index" ON "patrol_hits" USING btree ("status","light");--> statement-breakpoint
CREATE INDEX "patrol_hits_fingerprint_index" ON "patrol_hits" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "sync_batches_run_id_index" ON "sync_batches" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "sync_records_task_id_status_index" ON "sync_records" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "sync_runs_task_id_index" ON "sync_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "todos_assignee_id_status_due_at_index" ON "todos" USING btree ("assignee_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "todos_fingerprint_index" ON "todos" USING btree ("fingerprint");