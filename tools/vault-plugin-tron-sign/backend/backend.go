package backend

import (
	"context"
	"fmt"

	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

// Factory matches the Kaleido Vault plugin pattern — mount as a secrets engine (not stock Transit).
func Factory(ctx context.Context, conf *logical.BackendConfig) (logical.Backend, error) {
	b, err := Backend()
	if err != nil {
		return nil, err
	}
	if err := b.Setup(ctx, conf); err != nil {
		return nil, err
	}
	return b, nil
}

func Backend() (*backend, error) {
	var b backend
	b.Backend = &framework.Backend{
		Help: "TRON-compatible secp256k1 signer (TZ Wallet/Sweep §3): keys sealed in Vault storage; Sweep signs SHA256(TRON raw_data) without exporting private keys.",
		Paths: framework.PathAppend(
			pathAccounts(&b),
			pathSign(&b),
		),
		PathsSpecial: &logical.Paths{
			SealWrapStorage: []string{
				storagePrefixAccounts,
			},
		},
		Secrets:     []*framework.Secret{},
		BackendType: logical.TypeLogical,
	}
	return &b, nil
}

type backend struct {
	*framework.Backend
}

func (b *backend) existence(ctx context.Context, req *logical.Request, _ *framework.FieldData) (bool, error) {
	out, err := req.Storage.Get(ctx, req.Path)
	if err != nil {
		b.Logger().Error("path existence failed", err)
		return false, fmt.Errorf("existence check failed: %w", err)
	}
	return out != nil, nil
}
