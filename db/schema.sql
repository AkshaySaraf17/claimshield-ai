-- ClaimShield AI — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists vector;

-- Clinics using the tool (multi-tenant from day one)
create table if not exists clinics (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

-- Every denial + generated appeal, for audit trail and "no win no fee" billing
create table if not exists claims (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid references clinics(id) on delete cascade,
    raw_denial_text text not null,
    raw_clinical_notes text not null,
    denial_code text,
    denial_reason text,
    payer_name text,
    amount_denied numeric(10, 2),
    retrieved_policy_evidence text,
    generated_appeal text,
    status text not null default 'pending_review'
        check (status in ('pending_review', 'approved', 'sent', 'won', 'lost')),
    reviewed_by text,          -- billing staff member who approved it
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Embedded payer policy clauses for real RAG (replaces the static
-- STATIC_POLICY_KB dict in researcher_agent.py once populated)
create table if not exists policy_clauses (
    id uuid primary key default gen_random_uuid(),
    payer_name text not null,
    denial_code text,
    clause_text text not null,
    embedding vector(1536),    -- adjust dimension to match your embedding model
    created_at timestamptz not null default now()
);

-- Cosine-similarity search function used by the researcher agent
create or replace function match_policy_clauses(
    query_embedding vector(1536),
    match_denial_code text,
    match_count int default 3
)
returns table (
    id uuid,
    payer_name text,
    clause_text text,
    similarity float
)
language sql stable
as $$
    select
        id,
        payer_name,
        clause_text,
        1 - (embedding <=> query_embedding) as similarity
    from policy_clauses
    where denial_code = match_denial_code
    order by embedding <=> query_embedding
    limit match_count;
$$;

create index if not exists policy_clauses_embedding_idx
    on policy_clauses using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create index if not exists claims_clinic_idx on claims(clinic_id);
create index if not exists claims_status_idx on claims(status);
