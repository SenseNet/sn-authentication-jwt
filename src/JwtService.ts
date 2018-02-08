import { ConstantContent, IAuthenticationService, LoginState, Repository } from "@sensenet/client-core";
import { ObservableValue, PathHelper } from "@sensenet/client-utils";
import { User } from "@sensenet/default-content-types";
import { Query } from "@sensenet/query";
import { ILoginResponse } from "./ILoginResponse";
import { IOauthProvider } from "./IOauthProvider";
import { IRefreshResponse } from "./IRefreshResponse";
import { Token } from "./Token";
import { TokenPersist } from "./TokenPersist";
import { TokenStore } from "./TokenStore";

/**
 * This service class manages the JWT authentication, the session and the current login state.
 */
export class JwtService implements IAuthenticationService {

    private readonly jwtTokenKeyTemplate: string = "sn-${siteName}-${tokenName}";

    /**
     * Disposes the service, the state and currentUser observables
     */
    public dispose() {
        this.state.dispose();
        this.currentUser.dispose();
        for (const provider of this.oauthProviders) {
            provider.dispose();
        }
    }

    /**
     * Set of registered Oauth Providers
     */
    public oauthProviders: Set<IOauthProvider> = new Set<IOauthProvider>();

    /**
     * Observable value that will update with the current user on user change
     */
    public currentUser: ObservableValue<User> = new ObservableValue<User>(ConstantContent.VISITOR_USER);

    /**
     * This observable indicates the current state of the service
     * @default LoginState.Pending
     */
    public state: ObservableValue<LoginState> = new ObservableValue(LoginState.Pending);

    /**
     * The store for JWT tokens
     */
    private tokenStore: TokenStore =
        new TokenStore(this.repository.configuration.repositoryUrl, this.jwtTokenKeyTemplate, (this.repository.configuration.sessionLifetime === "session") ? TokenPersist.Session : TokenPersist.Expiration);

    /**
     * Executed before each Ajax call. If the access token has been expired, but the refresh token is still valid, it triggers the token refreshing call
     * @returns {Promise<boolean>} Promise with a boolean that indicates if there was a refresh triggered.
     */
    public async checkForUpdate(): Promise<boolean> {
        if (this.tokenStore.AccessToken.IsValid()) {
            this.state.setValue(LoginState.Authenticated);
            return false;
        }
        if (!this.tokenStore.RefreshToken.IsValid()) {
            this.state.setValue(LoginState.Unauthenticated);
            return false;
        }
        this.state.setValue(LoginState.Pending);
        return await this.execTokenRefresh();
    }

    /**
     * Executes the token refresh call. Refresh the token in the Token Store and in the Service, updates the HttpService header
     * @returns {Promise<boolean>} An promise that will be completed with true on a succesfull refresh
     */
    private async execTokenRefresh(): Promise<boolean> {
        const response = await this.repository.fetch(PathHelper.joinPaths(this.repository.configuration.repositoryUrl, "sn-token/refresh"),
            {
                method: "POST",
                headers: {
                    "X-Refresh-Data": this.tokenStore.RefreshToken.toString(),
                    "X-Authentication-Type": "Token",
                },
                cache: "no-cache",
                credentials: "include",
            }, false);

        if (response.ok) {
            const json: IRefreshResponse = await response.json();
            this.tokenStore.AccessToken = Token.FromHeadAndPayload(json.access);
            this.state.setValue(LoginState.Authenticated);
        } else {
            this.tokenStore.AccessToken = Token.CreateEmpty();
            this.state.setValue(LoginState.Unauthenticated);
        }
        return true;
    }

    private async updateUser() {
        const lastUser = this.currentUser.getValue();
        if (this.state.getValue() === LoginState.Unauthenticated) {
            this.currentUser.setValue(ConstantContent.VISITOR_USER);
        } else if (this.state.getValue() === LoginState.Authenticated && this.tokenStore.AccessToken.Username !== `${lastUser.Domain}\\${lastUser.LoginName}`) {
            const [domain, loginName] = this.tokenStore.AccessToken.Username.split("\\");
            const response = await this.repository.loadCollection({
                path: "Root",
                oDataOptions: {
                    query: new Query((q) => q.typeIs<User>(User).and.equals("Domain", domain).and.equals("LoginName", loginName)).toString(),
                },
            });
            this.currentUser.setValue(response.d.results[0]);
        }
    }

    /**
     * @param {BaseRepository} _repository the Repository reference for the Authentication. The service will read its configuration and use its HttpProvider
     * @constructs JwtService
     */
    constructor(public readonly repository: Repository) {
        this.repository.authentication = this;
        this.state.subscribe((state) => {this.updateUser(); });
        this.checkForUpdate();
    }

    /**
     * Updates the state based on a specific sensenet ECM Login Response
     * @param {LoginResponse} response
     */
    public handleAuthenticationResponse(response: ILoginResponse): boolean {
        this.tokenStore.AccessToken = Token.FromHeadAndPayload(response.access);
        this.tokenStore.RefreshToken = Token.FromHeadAndPayload(response.refresh);
        if (this.tokenStore.AccessToken.IsValid()) {
            this.state.setValue(LoginState.Authenticated);
            return true;
        }
        this.state.setValue(LoginState.Unauthenticated);
        return false;
    }

    /**
     * It is possible to send authentication requests using this action. You provide the username and password and will get the User object as the response if the login operation was
     * successful or HTTP 403 Forbidden message if it wasn’t. If the username does not contain a domain prefix, the configured default domain will be used. After you logged in the user successfully,
     * you will receive a standard ASP.NET auth cookie which will make sure that your subsequent requests will be authorized correctly.
     *
     * The username and password is sent in clear text, always send these kinds of requests through HTTPS.
     * @param username {string} Name of the user.
     * @param password {string} Password of the user.
     * @returns {Promise<boolean>} Returns a Promise that will resolved with a boolean value that indicates if the login was successfull.
     * ```
     * let userLogin = service.Login('alba', 'alba');
     * userLogin.subscribe({
     *  next: response => {
     *      console.log('Login success', response);
     *  },
     *  error: error => console.error('something wrong occurred: ' + error.responseJSON.error.message.value),
     *  complete: () => console.log('done'),
     * });
     * ```
     */
    public async login(username: string, password: string): Promise<boolean> {
        this.state.setValue(LoginState.Pending);
        const authToken: string = new Buffer(`${username}:${password}`).toString("base64");
        const response = await this.repository.fetch(
            PathHelper.joinPaths(this.repository.configuration.repositoryUrl, "sn-token/login"),
            {
                method: "POST",
                headers: {
                    "X-Authentication-Type": "Token",
                    "Authorization": `Basic ${authToken}`,
                },
                cache: "no-cache",
                credentials: "include",
            },
            false,
        );

        if (response.ok) {
            const json: ILoginResponse = await response.json();
            return this.handleAuthenticationResponse(json);
        } else {
            this.state.setValue(LoginState.Unauthenticated);
            return false;
        }
    }

    /**
     * Logs out the current user, sets the tokens to 'empty' and sends a Logout request to invalidate all Http only cookies
     * @returns {Promise<boolean>} A promise that will resolved with a boolean value that indicates if the logout succeeded.
     */
    public async logout(): Promise<boolean> {
        this.tokenStore.AccessToken = Token.CreateEmpty();
        this.tokenStore.RefreshToken = Token.CreateEmpty();
        this.state.setValue(LoginState.Unauthenticated);
        await this.repository.fetch(PathHelper.joinPaths(this.repository.configuration.repositoryUrl, "sn-token/logout"), {
            method: "POST",
            cache: "no-cache",
            credentials: "include",
        }, false);
        return true;
    }
}
