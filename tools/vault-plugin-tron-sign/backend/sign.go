package backend

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

func pathSign(b *backend) []*framework.Path {
	return []*framework.Path{
		{
			Pattern: `accounts/(?P<trader_id>[\w-]+)/sign$`,
			HelpSynopsis: "Sign a 32-byte TRON Transaction digest with the sealed private key (" +
				"same layout as ethereum crypto.Sign recovery signature).",
			Fields: map[string]*framework.FieldSchema{
				"trader_id": {
					Type:        framework.TypeString,
					Description: "Trader UUID previously imported under accounts/:id.",
				},
				"digest_hex": {
					Type:        framework.TypeString,
					Description: "Hex-encoded SHA256 hash of protobuf-serialized TRON Transaction.raw_data.",
				},
			},
			Callbacks: map[logical.Operation]framework.OperationFunc{
				logical.UpdateOperation: b.pathSignDigest,
			},
		},
	}
}

func (b *backend) pathSignDigest(ctx context.Context, req *logical.Request, d *framework.FieldData) (*logical.Response, error) {
	traderID, err := d.GetString("trader_id")
	if err != nil {
		return nil, err
	}
	digestHex, err := d.GetString("digest_hex")
	if err != nil {
		return nil, err
	}
	traderID = strings.TrimSpace(traderID)
	digestHex = strings.TrimPrefix(strings.TrimSpace(strings.ToLower(digestHex)), "0x")
	if traderID == "" || len(digestHex) != 64 {
		return logical.ErrorResponse("trader_id and 64-char digest_hex (SHA256) are required"), nil
	}

	ent, err := req.Storage.Get(ctx, storageKeyTrader(traderID))
	if err != nil {
		return nil, err
	}
	if ent == nil {
		return logical.ErrorResponse("TRON signer account_not_found"), nil
	}
	var acct storedAccount
	if err := json.Unmarshal(ent.Value, &acct); err != nil {
		return nil, err
	}
	pkHex := strings.TrimPrefix(strings.TrimSpace(strings.ToLower(acct.PrivateKeyHex)), "0x")
	if len(pkHex) != 64 {
		return logical.ErrorResponse("stored private_key invalid"), nil
	}

	digest := make([]byte, 32)
	for i := 0; i < 32; i++ {
		b1 := hexDigit(digestHex[i*2])
		b2 := hexDigit(digestHex[i*2+1])
		if b1 == 255 || b2 == 255 {
			return logical.ErrorResponse("digest_hex must be hexadecimal"), nil
		}
		digest[i] = b1<<4 | b2
	}

	key, err := crypto.HexToECDSA(pkHex)
	if err != nil {
		return nil, fmt.Errorf("invalid stored private key: %w", err)
	}

	sig, err := crypto.Sign(digest, key)
	if err != nil {
		return nil, err
	}
	if len(sig) != 65 {
		return logical.ErrorResponse("unexpected signature length"), nil
	}

	return &logical.Response{
		Data: map[string]interface{}{
			"signature": hex.EncodeToString(sig),
		},
	}, nil
}

func hexDigit(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	default:
		return 255
	}
}
