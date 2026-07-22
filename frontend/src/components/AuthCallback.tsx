import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { msalInstance } from "../authConfig";

export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const completeLogin = async () => {
            try {
                await msalInstance.initialize();

                const response = await msalInstance.handleRedirectPromise();

                if (response?.account) {
                    msalInstance.setActiveAccount(response.account);
                }

                navigate("/homepage", { replace: true });
            } catch (err) {
                console.error(err);
                navigate("/", { replace: true });
            }
        };

        completeLogin();
    }, [navigate]);

    return <div>Signing in...</div>;
}