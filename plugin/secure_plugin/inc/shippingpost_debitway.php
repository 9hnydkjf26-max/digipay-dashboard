<?php
/**
 * Digipay - Shipping Post Integration for WooCommerce Admin
 * 
 * Adds shipping post functionality to WooCommerce order details page.
 * 
 * Security: All output is properly escaped
 * 
 * @version 12.6.0
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'woocommerce_admin_order_data_after_billing_address', 'fluidcast_order_detailspage_npayg', 10, 1 );

function fluidcast_order_detailspage_npayg( $order ) {
    $order->get_shipping_methods();
    $shippedOptions = trim( $order->get_shipping_method() );
    echo '<p><strong>' . esc_html__( 'Shipping Option', 'digipay' ) . ':</strong> ' . esc_html( $shippedOptions ) . '</p>';
    
    if ( trim( $shippedOptions ) === 'In Person' ) {
        echo '<style>.debitway_paygo_shipping_postbox{display:none;} .order_data_column_container > .order_data_column:last-child { display:none !important; }</style>';
    }
}


add_action( 'woocommerce_admin_order_data_after_order_details', 'fluidcast_editable_order_meta_general_npaygo' );

function fluidcast_editable_order_meta_general_npaygo( $order ) {
    // Security: Verify user has permission
    if ( ! current_user_can( 'edit_shop_orders' ) ) {
        return;
    }

    $active_methods = array();
    $shipping_methods = WC()->shipping->get_shipping_methods();
    
    foreach ( $shipping_methods as $id => $shipping_method ) {
        if ( isset( $shipping_method->enabled ) && 'yes' === $shipping_method->enabled ) {
            $active_methods[ $id ] = array(
                'title'      => $shipping_method->title,
                'tax_status' => $shipping_method->tax_status,
            );
        }
    }

    $customer_note = $order->get_customer_note();
    
    // Get order ID safely
    $order_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : $order->get_id();
    
    // Build shipping address string (escaped)
    $shippingAddress = 'shipping_first_name:' . esc_attr( $order->get_shipping_first_name() );
    $shippingAddress .= '|shipping_last_name:' . esc_attr( $order->get_shipping_last_name() );
    $shippingAddress .= '|shipping_company:' . esc_attr( $order->get_shipping_company() );
    $shippingAddress .= '|shipping_address_1:' . esc_attr( $order->get_shipping_address_1() );
    $shippingAddress .= '|shipping_address_2:' . esc_attr( $order->get_shipping_address_2() );
    $shippingAddress .= '|shipping_city:' . esc_attr( $order->get_shipping_city() );
    $shippingAddress .= '|shipping_state:' . esc_attr( $order->get_shipping_state() );
    $shippingAddress .= '|shipping_postcode:' . esc_attr( $order->get_shipping_postcode() );
    $shippingAddress .= '|shipping_country:' . esc_attr( $order->get_shipping_country() );
    $shippingAddress .= '|Order_id:' . $order_id;
    
    $current_url = ( is_ssl() ? 'https://' : 'http://' ) . sanitize_text_field( $_SERVER['HTTP_HOST'] ) . esc_url( $_SERVER['REQUEST_URI'] );
    $shippingAddress .= '|currenturl:' . $current_url;
    
    $order->get_shipping_methods();
    $shipping_options = $order->get_shipping_method();
    $shippingAddress .= '|Shipping_options:' . esc_attr( $shipping_options );
    $shippingAddress .= '|hash:' . md5( $order->get_id() );

    if ( ! empty( $customer_note ) ) {
        $commentsDebitway = urlencode( $customer_note ) . '|' . $shippingAddress;
    } else {
        $commentsDebitway = $shippingAddress;
    }

    add_action( 'admin_head', 'digipay_shipping_admin_head' );
    ?>
 
    <div class="clear"></div>
    <div class="debitway_paygo_shipping_postbox" style="border:2px solid #f90;overflow:hidden;margin-top:10px;">
        <div style="padding:10px;">
            <h1><?php esc_html_e( 'CPTSecure Shipping Post', 'digipay' ); ?></h1>

            <div id="notification_post"></div>
            <div id="notification_postback"></div>
            <div class="address">
                
                <div class="form_debitway">
                    
                    <p class="form-field form-field-wide">
                        <label for="shipping_method"><?php esc_html_e( 'Shipping type:', 'digipay' ); ?></label>
                        <select name="shipping_method" id="shipping_method">
                            <?php foreach ( $active_methods as $key => $shipping_method_data ) : ?>
                                <?php if ( $key !== 'local_pickup' ) : ?>
                                    <option value="<?php echo esc_attr( $key ); ?>">
                                        <?php echo esc_html( ucfirst( str_replace( '_', ' ', $key ) ) ); ?>
                                    </option>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </select>    
                    </p>

                    <p class="form-field form-field-wide">
                        <label for="tracking_number"><?php esc_html_e( 'Tracking Number:', 'digipay' ); ?></label>
                        <input type="text" name="tracking_number" id="tracking_number">
                    </p>

                    <p class="form-field form-field-wide">
                        <label for="comments"><?php esc_html_e( 'Comments:', 'digipay' ); ?> &nbsp;(minimum: 300 characters)</label>
                        <span id="remainingC"></span>
                        <textarea name="comments" id="comments" class="input-text" cols="20" rows="10"><?php echo esc_textarea( $commentsDebitway ); ?></textarea>
                    </p>

                    <p class="form-field form-field-wide" style="margin-bottom:20px;">
                        <input type="hidden" name="session" id="session" value="<?php echo esc_attr( $order_id ); ?>"/>
                        <input type="hidden" name="date_order" id="date_order" value="<?php echo esc_attr( date( 'Y-m-d' ) ); ?>"/>
                        <a class="button save_order button-primary" id="send_shipping_post"><?php esc_html_e( 'Send', 'digipay' ); ?></a>
                    </p>
                     
                </div>    

            </div>    
            
        </div>
    </div>
    
    <script>
    jQuery(document).ready(function($) {
        var len = 0;
        var maxchar = 300;

        var lengt = $('#comments').val().length;
        $('#remainingC').html('Total Character: ' + lengt);

        $('#comments').keyup(function() {
            len = this.value.length;
            $('#remainingC').html('Total characters: ' + len);
        });
    });

    jQuery(function($) {
        $('#send_shipping_post').click(function() {
            
            $('#notification_post').html('');
            
            var tracking_number = $('#tracking_number').val();
            var session = $('#session').val();
            var comments = $('#comments').val();
            var shipping_method = $('#shipping_method').val();
            var date_order = $('#date_order').val();

            $.ajax({
                type: 'GET',
                url: 'https://payments.fintechwerx.com/order/shipping.php',
                data: {
                    'session': session,
                    'shipping_method': shipping_method,
                    'tracking_number': tracking_number,
                    'date': date_order,
                    'comments': comments
                },
                success: function(response) {
                    response = $.trim(response);
                    if (response == '1') {
                        $('#notification_post').html('<span class="success" style="color:green;"><strong>Successfully completed.</strong></span>');
                        // Load success handler with proper URL
                        $('#notification_postback').load(
                            '<?php echo esc_url( plugin_dir_url( __FILE__ ) . 'debitway_postback_ifsuccess.php' ); ?>?session=' + encodeURIComponent(session)
                        );
                    } else {
                        $('#notification_post').html('<span class="error" style="color:red;"><strong>Action cannot be completed.</strong></span>');
                    }
                },
                error: function() {
                    $('#notification_post').html('<span class="error" style="color:red;"><strong>Request failed. Please try again.</strong></span>');
                }
            });
        });
    });
    </script>

    <?php
}

function digipay_shipping_admin_head() {
    ?>
    <style>
        #Fluidcast_shipping_options_field { clear: both !important; }
    </style>
    <?php
}

// Hide shipping options if select shipping option to "In Person"
add_action( 'woocommerce_after_checkout_form', 'fluidcast_disable_shipping_local_pickup_npaygo' );
 
function fluidcast_disable_shipping_local_pickup_npaygo( $available_gateways ) {
    
    $chosen_methods = WC()->session->get( 'chosen_shipping_methods' );
    
    if ( empty( $chosen_methods ) ) {
        return;
    }
    
    $chosen_shipping_no_ajax = isset( $chosen_methods[0] ) ? $chosen_methods[0] : '';
    
    if ( strpos( $chosen_shipping_no_ajax, 'local_pickup' ) === 0 ) {
        ?>
        <style>#Fluidcast_shipping_options_field { clear: both !important; }</style>
        <script type="text/javascript">
            jQuery('.woocommerce-shipping-fields').fadeOut();
        </script>
        <?php
    }
    ?>
    <script type="text/javascript">
        jQuery('form.checkout').on('change', 'input[name^="shipping_method"]', function() {
            var val = jQuery(this).val();
            if (val.match("^local_pickup")) {
                jQuery('.woocommerce-shipping-fields').fadeOut();
            } else {
                jQuery('.woocommerce-shipping-fields').fadeIn();
            }
        });
    </script>
    <?php
}
