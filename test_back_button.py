import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By

def run_test():
    print("Starting automated back-button trap test...")
    
    # Configure Chrome options to run headless to be clean and fast
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
        # Step 1: Open the root login page
        print("1. Opening root login page...")
        driver.get("http://localhost:5173/")
        time.sleep(2)
        
        # Step 2: Simulate pre-login state
        current_len = driver.execute_script("return window.history.length;")
        print(f"   Current history length: {current_len}")
        driver.execute_script(f"sessionStorage.setItem('_preLoginHistLen', '{current_len}');")
        driver.execute_script("sessionStorage.removeItem('_historyClean');")
        driver.execute_script("sessionStorage.removeItem('test_login');")
        
        # Step 3: Navigate to homepage with test_login=true (simulating returning redirect)
        print("2. Simulating redirect to homepage with test_login=true...")
        driver.get("http://localhost:5173/homepage?test_login=true")
        time.sleep(3)
        
        print(f"   URL after redirect: {driver.current_url}")
        print(f"   History length after redirect: {driver.execute_script('return window.history.length;')}")
        
        # Step 4: Click the browser's back button
        print("3. Clicking browser back button...")
        driver.back()
        time.sleep(2)
        
        url_after_back = driver.current_url
        print(f"   URL after back: {url_after_back}")
        
        # Verify: Back button keeps the user on homepage, never on Microsoft
        assert "login.microsoftonline.com" not in url_after_back, "FAIL: Browser ended up on Microsoft's page"
        assert "homepage" in url_after_back or url_after_back.rstrip("/") == "http://localhost:5173", \
            f"FAIL: Expected homepage or login page, got: {url_after_back}"
        print("\nSUCCESS: Browser back button redirected to homepage cleanly, no Microsoft error page!")
        
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
