package github

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/ovh/cds/sdk"
	"github.com/rockbears/log"
)

//Github const
var (
	requestedScope = []string{"user:email", "repo", "admin:repo_hook"} //https://developer.github.com/v3/oauth/#scopes
)

//AuthorizeRedirect returns the request token, the Authorize GitHubURL
//doc: https://developer.github.com/v3/oauth/#web-application-flow
func (g *githubConsumer) AuthorizeRedirect(ctx context.Context) (string, string, error) {
	// GET https://github.com/login/oauth/authorize
	// with parameters : client_id, redirect_uri, scope, state
	requestToken, err := sdk.GenerateHash()
	if err != nil {
		return "", "", err
	}

	val := url.Values{}
	val.Add("client_id", g.ClientID)
	//Leave the default value set in github. If we would it to be tweakable; we should do it this way: val.Add("redirect_uri", g.AuthorizationCallbackURL)
	val.Add("scope", strings.Join(requestedScope, " "))
	val.Add("state", requestToken)

	authorizeURL := fmt.Sprintf("%s/login/oauth/authorize?%s", g.GitHubURL, val.Encode())

	return requestToken, authorizeURL, nil
}

//AuthorizeToken returns the authorized token (and its secret)
//from the request token and the verifier got on authorize url
func (g *githubConsumer) AuthorizeToken(ctx context.Context, state, code string) (string, string, error) {
	log.Debug(ctx, "AuthorizeToken> Github send code %s for state %s", code, state)
	//POST https://github.com/login/oauth/access_token
	//Parameters:
	//	client_id
	//	client_secret
	//	code
	//	state

	params := url.Values{}
	params.Add("client_id", g.ClientID)
	params.Add("client_secret", g.ClientSecret)
	params.Add("code", code)
	params.Add("state", state)

	headers := map[string][]string{}
	headers["Accept"] = []string{"application/json"}

	status, res, err := g.postForm("/login/oauth/access_token", params, headers)
	if err != nil {
		return "", "", err
	}

	if status < 200 || status >= 400 {
		return "", "", fmt.Errorf("Github error (%d) %s ", status, string(res))
	}

	ghResponse := map[string]string{}
	if err := sdk.JSONUnmarshal(res, &ghResponse); err != nil {
		return "", "", fmt.Errorf("Unable to parse github response (%d) %s ", status, string(res))
	}

	//Github return scope as "scope":"repo,gist"
	//Should we check scopes ?	ghScope := strings.Split(ghResponse["scope"], ",")

	return ghResponse["access_token"], state, nil
}

//keep client in memory
var instancesAuthorizedClient = map[string]*githubClient{}

//GetAuthorized returns an authorized client
func (g *githubConsumer) GetAuthorizedClient(ctx context.Context, accessToken, accessTokenSecret string, _ int64) (sdk.VCSAuthorizedClient, error) {
	c, ok := instancesAuthorizedClient[accessToken]
	if !ok {
		c = &githubClient{
			ClientID:            g.ClientID,
			OAuthToken:          accessToken,
			GitHubURL:           g.GitHubURL,
			GitHubAPIURL:        g.GitHubAPIURL,
			Cache:               g.Cache,
			uiURL:               g.uiURL,
			DisableStatus:       g.disableStatus,
			DisableStatusDetail: g.disableStatusDetail,
			apiURL:              g.apiURL,
			proxyURL:            g.proxyURL,
			username:            g.username,
			token:               g.token,
		}
		instancesAuthorizedClient[accessToken] = c
	}
	return c, c.RateLimit(ctx)
}
