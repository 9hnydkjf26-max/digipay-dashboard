<?php
/**
 * Digipay Payment Gateway - Postback Handler
 * 
 * Security features:
 * - Rate limiting
 * - Input sanitization
 * - Referrer validation
 * - Debug logging only in WP_DEBUG mode
 * - Protected log directory
 * - Deduplication of postbacks
 * 
 * @version 12.6.0
 */

// Set security headers
header( 'X-Content-Type-Options: nosniff' );
header( 'X-Frame-Options: DENY' );
header( 'X-XSS-Protection: 1; mode=block' );

// Load WordPress
require_once( dirname( __FILE__ ) . '/../../../wp-load.php' );

// ============================================================
// HELPER: Secure logging function
// ============================================================
function digipay_secure_log( $message, $log_type = 'postback' ) {
    // Only log if WP_DEBUG is enabled
    if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
        return;
    }
    
    $upload_dir = wp_get_upload_dir();
    $log_dir = $upload_dir['basedir'] . '/digipay-logs';
    
    // Create log directory with protection if it doesn't exist
    if ( ! file_exists( $log_dir ) ) {
        wp_mkdir_p( $log_dir );
        // Protect directory from direct access
        file_put_contents( $log_dir . '/.htaccess', "Order Deny,Allow\nDeny from all\n" );
        file_put_contents( $log_dir . '/index.php', '<?php // Silence is golden' );
    }
    
    $log_file = $log_dir . '/' . $log_type . '_' . date( 'Y-m-d' ) . '.log';
    $timestamp = date( 'Y-m-d H:i:s' );
    $ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    
    file_put_contents( 
        $log_file, 
        "[{$timestamp}] [{$ip}] {$message}\n", 
        FILE_APPEND | LOCK_EX 
    );
}

// ============================================================
// RATE LIMITING
// ============================================================
$client_ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
$rate_limit_key = 'digipay_rate_' . md5( $client_ip );
$rate_count = get_transient( $rate_limit_key );

if ( $rate_count === false ) {
    set_transient( $rate_limit_key, 1, MINUTE_IN_SECONDS );
} elseif ( $rate_count > 60 ) {
    // More than 60 requests per minute from same IP
    digipay_secure_log( "Rate limit exceeded for IP: {$client_ip}", 'security' );
    http_response_code( 429 );
    die( 'Too many requests. Please try again later.' );
} else {
    set_transient( $rate_limit_key, $rate_count + 1, MINUTE_IN_SECONDS );
}

// ============================================================
// DEBUG LOGGING (Only in WP_DEBUG mode, sanitized)
// ============================================================
if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
    // Sanitize request data for logging - redact sensitive fields
    $safe_request = $_REQUEST;
    $sensitive_fields = array( 
        'card_number', 'cvv', 'cc_number', 'card', 'password', 
        'card_exp', 'cc_exp', 'security_code', 'cvc' 
    );
    foreach ( $sensitive_fields as $field ) {
        if ( isset( $safe_request[ $field ] ) ) {
            $safe_request[ $field ] = '[REDACTED]';
        }
    }
    digipay_secure_log( 'Request: ' . wp_json_encode( $safe_request ), 'postback_debug' );
}

// ============================================================
// INPUT SANITIZATION
// ============================================================
$order_id = isset( $_REQUEST['session'] ) ? absint( $_REQUEST['session'] ) : 0;
$status_post = isset( $_REQUEST['status_post'] ) ? sanitize_text_field( $_REQUEST['status_post'] ) : '';
$transid = isset( $_REQUEST['transid'] ) ? sanitize_text_field( $_REQUEST['transid'] ) : '';

// ============================================================
// EARLY EXIT: If no session/order_id, this isn't a real postback
// ============================================================
if ( empty( $order_id ) || $order_id < 1 ) {
    digipay_secure_log( 'Ignored: No valid session/order_id', 'postback_debug' );
    exit;
}

// ============================================================
// DEDUPLICATION: Prevent double-tracking the same transaction
// ============================================================
$postback_key = 'digipay_pb_' . $order_id . '_' . md5( $transid . $status_post );
if ( get_transient( $postback_key ) ) {
    digipay_secure_log( "Duplicate postback ignored for order {$order_id}", 'postback_debug' );
    exit;
}
// Mark as processed for 5 minutes
set_transient( $postback_key, true, 5 * MINUTE_IN_SECONDS );

// ============================================================
// BOT PROTECTION
// ============================================================
function digipay_block_bad_bots() {
    $bad_agents = array(
        'BadBot', 'EvilScraper', 'FakeGoogleBot', 'SQLmap', 'nikto', 'nmap'
    );
    // Note: Don't block curl/wget as payment processors may use them

    $user_agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? $_SERVER['HTTP_USER_AGENT'] : '';

    foreach ( $bad_agents as $bad_agent ) {
        if ( stripos( $user_agent, $bad_agent ) !== false ) {
            digipay_secure_log( "Blocked bad bot: {$user_agent}", 'security' );
            http_response_code( 403 );
            die( '403 Forbidden' );
        }
    }
}
digipay_block_bad_bots();

// ============================================================
// REFERRER VALIDATION (Fixed logic - was using || instead of &&)
// ============================================================
$allowed_referrers = array(
    'https://secure.cptpayments.com',
    'https://payments.paygobilling.com',
    'https://secure.digipay.co'
);

$referrer = isset( $_SERVER['HTTP_REFERER'] ) ? $_SERVER['HTTP_REFERER'] : '';

// Only validate if referrer is present (some postbacks may legitimately have no referrer)
if ( ! empty( $referrer ) ) {
    $is_allowed = false;
    
    foreach ( $allowed_referrers as $allowed ) {
        if ( strpos( $referrer, $allowed ) === 0 ) {
            $is_allowed = true;
            break;
        }
    }
    
    if ( ! $is_allowed ) {
        digipay_secure_log( "Blocked unauthorized referrer: {$referrer}", 'security' );
        http_response_code( 403 );
        die( 'Unauthorized access' );
    }
}

// ============================================================
// SAVE TRANSACTION DATA (Sanitized)
// ============================================================
if ( ! empty( $transid ) ) {
    update_post_meta( $order_id, '_paygo_cc_transaction_id', $transid );
}

if ( ! empty( $status_post ) ) {
    // Validate status is one of the expected values
    $allowed_statuses = array( 'approved', 'denied', 'pending', 'error', 'completed', 'processing' );
    if ( in_array( strtolower( $status_post ), $allowed_statuses, true ) ) {
        update_post_meta( $order_id, '_paygo_cc_transaction_status', $status_post );
    }
}

// ============================================================
// HANDLE DENIED TRANSACTIONS
// ============================================================
if ( strtolower( $status_post ) === 'denied' ) {
    // Track denied postback (this is expected behavior, not an error)
    if ( function_exists( 'digipay_track_postback' ) ) {
        digipay_track_postback( true ); // Postback received successfully, payment was denied
    }
    digipay_secure_log( "Order {$order_id}: Payment denied", 'transactions' );
    exit;
}

// ============================================================
// VALIDATE ORDER EXISTS
// ============================================================
$order = wc_get_order( $order_id );

if ( ! $order ) {
    // Don't track failures for diagnostic tests
    $is_diagnostic_test = isset( $_SERVER['HTTP_X_DIGIPAY_TEST'] ) && $_SERVER['HTTP_X_DIGIPAY_TEST'] === 'true';
    
    if ( function_exists( 'digipay_track_postback' ) && ! $is_diagnostic_test ) {
        digipay_track_postback( false, 'Order ID ' . $order_id . ' does not exist' );
    }
    
    digipay_secure_log( "Order {$order_id} not found", 'errors' );
    http_response_code( 404 );
    echo '<p style="color: red;">Order not found.</p>';
    exit;
}

// ============================================================
// UPDATE ORDER STATUS
// ============================================================
$order->update_status( 'processing', __( 'Payment received via Digipay', 'digipay' ) );

// Track successful postback
if ( function_exists( 'digipay_track_postback' ) ) {
    digipay_track_postback( true );
}

digipay_secure_log( "Order {$order_id}: Status updated to processing (trans: {$transid})", 'transactions' );

// ============================================================
// RETURN SUCCESS RESPONSE
// ============================================================
header( 'Content-Type: application/xml; charset=utf-8' );
?>
<rsp stat="ok" version="1.0">
<message id="100">Success</message>
<order_id><?php echo esc_html( $order_id ); ?></order_id>
</rsp>
