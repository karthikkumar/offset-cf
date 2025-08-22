-- merchant
INSERT INTO merchants (store_domain, invoice_email, currency)
VALUES ('ecocart-widget.myshopify.com', 'sales@ecocart.com', 'USD')
ON CONFLICT (store_domain) DO NOTHING;

-- widget config for that merchant
INSERT INTO widget_configs (merchant_id, placement, verbiage, theme_json)
SELECT id, '#main-cart-footer', 'Reduce my order's carbon footprint', '{"accent":"#0f766e"}'::jsonb
FROM merchants
WHERE store_domain = 'ecocart-widget.myshopify.com'
ON CONFLICT DO NOTHING;
