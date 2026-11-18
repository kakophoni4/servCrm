# Avito API: checked contracts

Checked 2026-11-18. The official developer portal returned HTTP 429 (IP restriction). We did **not** verify current documentation directly on the authoritative host. Contract evidence below comes from preserved copies of Avito's specification. Live read responses in this integration establish response shapes, not independently their currency units. No real messages were sent to verify the write contract.

## Item statistics and currency

Official reference: https://developers.avito.ru/api-catalog/item/documentation#operation/itemAnalytics

Preserved Item Swagger 3.0.0: https://github.com/Bambale0/aicrm/blob/main/avito.md

`POST /stats/v2/accounts/{user_id}/items`, operation `itemAnalytics`, returns grouped metrics. Its preserved description explicitly identifies `spending` as monetary advertising expenditure in kopecks. Convert to rubles exactly once by dividing by 100: `2604824` becomes `26048.24` RUB. `allSpending` additionally includes bonuses and is not interchangeable with `spending`. Do not infer units for unrelated endpoints from this contract.

## Explicit text reply

Official reference: https://developers.avito.ru/api-catalog/messenger/documentation#operation/postSendMessage

The Bambale0 file contains Item API only, not Messenger. Messenger evidence was cross-checked in the preserved/combined OpenAPI 3.0.0 document https://gist.github.com/dialapus/7949225cfd406cd8250762de524c151b and the transformed mirror https://artifacts.apis.io/avito/openapi/avito-messenger-api-openapi.yml . Neither is an authoritative current-host verification.

`POST /messenger/v1/accounts/{user_id}/chats/{chat_id}/messages`, operation `postSendMessage`, with bearer authentication and JSON:

```json
{"type":"text","message":{"text":"Message text"}}
```

Schema fragment in the combined OpenAPI 3.0.0 copy:

```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "object",
      "properties": {
        "text": {"type": "string", "maxLength": 1000}
      }
    },
    "type": {"type": "string", "enum": ["text"]}
  }
}
```

That copy does not declare `required` for text/message/type. The transformed mirror has an inconsistent `required: ["url"]` despite no `url` property. Do not introduce a URL field. CRM validation should deliberately require a nonempty text and limit it to 1000 characters; these are application constraints, not a claim about a verified `required` list.

Documented success: HTTP 200 with an object containing `id`, `created` (integer), `type`, `direction`, and `content.text`. For OAuth authorization-code access the mirror lists `messenger:write`; ClientCredentials is also listed. The combined copy only lists ClientCredentials, so it does not independently establish the scope list.

Send only on the user's explicit send action. Do not automatically retry ambiguous transport failures: the examined contract does not establish a client idempotency key. Check history before attempting a repeat. Tests must capture the transport rather than post to real chats.

## Deployment

Set `AVITO_SECRETS_DIR` in the production compose `.env` to a server-only directory containing `avito.json` with `client_id` and `client_secret`. Directory mode 0700, file 0600. Compose mounts it read-only at `/run/secrets`. The API reads `AVITO_CREDENTIALS_FILE`; credentials and access tokens are never sent to the web client. Do not commit the directory. No database migration is needed.

Validation: `node apps/api/test/avito-check.cjs`, `node apps/api/test/avito-stats-check.cjs`, and the local-database-only `staff-http-check.cjs`. The first two use mock transport. Production smoke checks may read profile/chats/messages/draft/stats but must not send test messages to customers.
