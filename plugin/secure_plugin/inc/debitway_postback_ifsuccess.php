<?php
/**
 * Digipay - Shipping Post Success Handler
 * 
 * Called via AJAX when admin completes shipping post action.
 * 
 * Security: This endpoint requires:
 * - Valid WordPress admin session
 * - edit_shop_orders capability
 * - Valid order ID
 * 
 * @version 12.6.0
 */

// Load WordPress
require_once( dirname( __FILE__ ) . '/../../../../wp-load.php' );

// Security: Set headers
header( 'X-Content-Type-Options: nosniff' );
header( 'Content-Type: text/plain; charset=utf-8' );

// Security: Verify user is logged in and has permission
if ( ! is_user_logged_in() ) {
    http_response_code( 401 );
    die( '0' ); // Return 0 for failure
}

if ( ! current_user_can( 'edit_shop_orders' ) ) {
    http_response_code( 403 );
    die( '0' );
}

// Get and validate order ID
$order_id = isset( $_REQUEST['session'] ) ? absint( $_REQUEST['session'] ) : 0;

if ( empty( $order_id ) || $order_id < 1 ) {
    http_response_code( 400 );
    die( '0' );
}

// Get the order
$order = wc_get_order( $order_id );

if ( ! $order ) {
    http_response_code( 404 );
    die( '0' );
}

// Update order status to completed
$order->update_status( 'completed', __( 'Order completed via shipping post action.', 'digipay' ) );

// Return success
echo '1';
exit;
