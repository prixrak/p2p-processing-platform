package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

const storagePrefixAccounts = "accounts/"

func pathAccounts(b *backend) []*framework.Path {
	return []*framework.Path{
		{
			Pattern:      `accounts/(?P<trader_id>[\w-]+)$`,
			HelpSynopsis: "Import or overwrite a trader secp256k1 private key (hex, 64 chars) sealed in Vault.",
			Fields: map[string]*framework.FieldSchema{
				"trader_id": {
					Type:        framework.TypeString,
					Description: "Trader UUID used as Stable account identifier.",
				},
				"private_key": {
					Type:        framework.TypeString,
					Description: "32-byte ECDSA private key as hex without 0x prefix.",
				},
			},
			Callbacks: map[logical.Operation]framework.OperationFunc{
				logical.ReadOperation:   b.pathAccountPeek,
				logical.UpdateOperation: b.pathAccountUpsert,
			},
			ExistenceCheck: func(ctx context.Context, req *logical.Request, d *framework.FieldData) (bool, error) {
				id, err := d.GetString("trader_id")
				if err != nil {
					return false, err
				}
				return b.exists(ctx, req, id)
			},
		},
	}
}

func (b *backend) pathAccountPeek(ctx context.Context, req *logical.Request, d *framework.FieldData) (*logical.Response, error) {
	traderID, err := d.GetString("trader_id")
	if err != nil {
		return nil, err
	}
	traderID = strings.TrimSpace(traderID)
	if traderID == "" {
		return logical.ErrorResponse("trader_id required"), nil
	}
	ok, err := b.exists(ctx, req, traderID)
	if err != nil {
		return nil, err
	}
	return &logical.Response{
		Data: map[string]interface{}{
			"exists": ok,
		},
	}, nil
}

type storedAccount struct {
	PrivateKeyHex string `json:"private_key_hex"`
}

func storageKeyTrader(traderID string) string {
	return path.Join(strings.TrimSuffix(storagePrefixAccounts, "/"), traderID)
}

func (b *backend) exists(ctx context.Context, req *logical.Request, traderID string) (bool, error) {
	ent, err := req.Storage.Get(ctx, storageKeyTrader(traderID))
	if err != nil {
		return false, err
	}
	return ent != nil, nil
}

func (b *backend) pathAccountUpsert(ctx context.Context, req *logical.Request, d *framework.FieldData) (*logical.Response, error) {
	traderID, err := d.GetString("trader_id")
	if err != nil {
		return nil, err
	}
	pkHex, err := d.GetString("private_key")
	if err != nil {
		return nil, err
	}
	traderID = strings.TrimSpace(traderID)
	pkHex = strings.TrimPrefix(strings.TrimSpace(strings.ToLower(pkHex)), "0x")
	if traderID == "" || len(pkHex) != 64 {
		return logical.ErrorResponse("trader_id and 64-char private_key hex are required"), nil
	}
	for _, ch := range pkHex {
		if ch < '0' || ch > 'f' || (ch > '9' && ch < 'a') {
			return logical.ErrorResponse("private_key must be hex [0-9a-f]"), nil
		}
	}
	raw, err := json.Marshal(storedAccount{PrivateKeyHex: pkHex})
	if err != nil {
		return nil, err
	}
	if err := req.Storage.Put(ctx, &logical.StorageEntry{
		Key:      storageKeyTrader(traderID),
		Value:    raw,
		SealWrap: true,
	}); err != nil {
		return nil, err
	}
	return &logical.Response{
		Data: map[string]interface{}{
			"trader_id": traderID,
			"stored":    true,
		},
	}, nil
}
