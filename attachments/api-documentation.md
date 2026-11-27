# NovaCommerce sandbox
Run `python mock_services.py` (Python 3.9+). Base URL: http://127.0.0.1:8765. No keys. All POST bodies and responses are JSON. Data is in memory on the mock service and resets on restart; your own application must persist its data. All amounts are integer paise (100 paise = INR 1).

| Method | Path | Behaviour |
|---|---|---|
| GET | /health | Service health |
| GET | /commerce/customers | Customer array |
| GET | /commerce/orders | Order array |
| GET | /commerce/orders/{order_id} | Order object |
| POST | /commerce/orders/{order_id}/cancel | Cancel order, empty JSON body |
| GET | /payments/transactions | Payment array |
| GET | /payments/transactions/{order_id} | Payment object |
| POST | /payments/refunds | Body: order_id, amount_minor; returns refund object |
| GET | /payments/refunds | Refund array |
| GET | /payments/refunds/{refund_id} | Refund object |
| GET | /shipping/shipments | Shipment array |
| GET | /shipping/shipments/{order_id} | Shipment object |
| POST | /commerce/tickets | Body: order_id, reason; returns ticket object |
| GET | /commerce/tickets | Ticket array |

Errors return JSON with an error field and HTTP 400, 404, 409 or 503. Refund responses include a status field; inspect it. Shipping lookup for NC-1012 returns 503 and refund for NC-1010 returns a failed refund object. The mock services do not implement employee identity or permissions; those are application responsibilities. Refunds may be partial (positive integer paise up to captured amount). A workflow refund action should allow an explicit amount to be configured.

## Incoming events
Your application should expose POST /api/webhooks (or document an equivalent endpoint). Each event is a JSON object with event_id, type, occurred_at (UTC ISO 8601), order_id and data. See webhook_examples.json. A shipment.updated event contains data.status; payment.failed contains data.status; order.cancelled contains data.status. Events represent upstream notifications and should update your application's local projection and trigger applicable workflows. The example files do not mutate the mock service itself. To test live business actions, use orders already eligible in the mock service or cancel an eligible order first. Deliver events using curl or your preferred HTTP client. Document your event processing and synchronization assumptions.
