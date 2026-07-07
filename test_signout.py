import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_test():
    print("Starting automated signout redirect test...")
    
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    try:
        driver = webdriver.Chrome(options=options)
    except Exception as e:
        print(f"Failed to start Chrome, trying Edge: {e}")
        try:
            edge_options = webdriver.EdgeOptions()
            edge_options.add_argument("--headless=new")
            driver = webdriver.Edge(options=edge_options)
        except Exception as e2:
            print(f"Failed to start Edge as well: {e2}")
            sys.exit(1)

    try:
        # Step 1: Navigate to homepage with test_login=true to authenticate instantly
        print("1. Accessing app homepage using bypass...")
        driver.get("http://localhost:5173/homepage?test_login=true")
        time.sleep(3)
        
        # Verify authenticated state
        body_text = driver.find_element(By.TAG_NAME, "body").text
        assert "Nissen DMS" in body_text, "FAIL: App did not load authenticated state correctly."
        print("   Logged in successfully (bypass state active).")

        # Step 2: Trigger signout flow
        print("2. Clicking 'Sign Out' button in sidebar...")
        signout_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Sign Out')]"))
        )
        signout_btn.click()
        time.sleep(1)

        # Step 3: Click 'Sign Out (Current Account)' to trigger MSAL redirect logout
        print("3. Selecting current account signout from modal...")
        confirm_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Sign Out (Current Account)')]"))
        )
        confirm_btn.click()
        time.sleep(4)  # Wait for MSAL redirection and return
        
        current_url = driver.current_url
        print(f"   Current URL: {current_url}")
        
        # Check if local storage was cleared
        ls_keys = driver.execute_script("return Object.keys(localStorage);")
        ss_keys = driver.execute_script("return Object.keys(sessionStorage);")
        print(f"   LocalStorage keys remaining: {ls_keys}")
        print(f"   SessionStorage keys remaining: {ss_keys}")
        
        session_keys = [k for k in ls_keys if "msal.version" not in k]
        assert len(session_keys) == 0, f"FAIL: LocalStorage was not cleared after signout. Remaining keys: {session_keys}"
        assert len(ss_keys) == 0, "FAIL: SessionStorage was not cleared after signout."
        
        # Check if we successfully landed back on the signout/login screen
        # Note: Since headless Chrome has no real Microsoft credentials, the logoutRedirect will redirect
        # to Microsoft's logout endpoint and then back to /auth -> which redirects to /signout.
        assert "signout" in current_url or current_url.rstrip("/") == "http://localhost:5173", \
            f"FAIL: Expected to end up on signout page or root login, got: {current_url}"
        
        print("\nSUCCESS: Signout correctly cleared local sessions and routed through MSAL redirect!")
        
    except AssertionError as ae:
        print(f"\nTEST FAILED: {ae}")
        sys.exit(1)
    except Exception as ex:
        print(f"\nUNEXPECTED ERROR: {ex}")
        sys.exit(1)
    finally:
        driver.quit()

if __name__ == "__main__":
    run_test()
