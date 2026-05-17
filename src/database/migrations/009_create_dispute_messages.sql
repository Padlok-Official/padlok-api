-- Migration 009: Create dispute messages and templates

CREATE TABLE IF NOT EXISTS dispute_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed some default templates
INSERT INTO dispute_message_templates (title, body) VALUES
  ('Request More Evidence', 'We need more evidence to proceed with your dispute. Please upload clear photos or documents related to this transaction.'),
  ('Warning: Policy Violation', 'Your actions on this transaction appear to violate our policies. Please provide a detailed explanation of the events.'),
  ('Dispute Update: Reviewing', 'We are currently reviewing the evidence provided for your dispute. We will notify you once a decision has been reached.')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id),
  template_id UUID REFERENCES dispute_message_templates(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  channel VARCHAR(50) NOT NULL DEFAULT 'in-app',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dispute_messages_dispute_id ON dispute_messages(dispute_id);
CREATE INDEX idx_dispute_messages_recipient_id ON dispute_messages(recipient_id);
