import PageManager from './page-manager';
import $ from 'jquery';
import _ from 'lodash';
import giftCertCheck from './common/gift-certificate-validator';
import utils from '@bigcommerce/stencil-utils';
import ShippingEstimator from './cart/shipping-estimator';
import { defaultModal } from './global/modal';
import swal from 'sweetalert2';

export default class Cart extends PageManager {
    onReady() {
        this.$cartContent = $('[data-cart-content]');
        this.$cartMessages = $('[data-cart-status]');
        this.$cartTotals = $('[data-cart-totals]');
        this.$overlay = $('[data-cart] .loadingOverlay')
            .hide(); // TODO: temporary until roper pulls in his cart components

        this.bindEvents();
    }

    cartUpdate($target) {
        const itemId = $target.data('cart-itemid');
        const $el = $(`#qty-${itemId}`);
        const oldQty = parseInt($el.val(), 10);
        const maxQty = parseInt($el.data('quantity-max'), 10);
        const minQty = parseInt($el.data('quantity-min'), 10);
        const oldqty = parseInt($el.data('old-value'), 10);
        const minError = $el.data('quantity-min-error');
        const maxError = $el.data('quantity-max-error');
        const eqError = $el.data('quantity-eq-error');
        let newQty;
        if ($target.data('action') === undefined) {
            newQty = $target.val();
        } else {
            newQty = $target.data('action') === 'inc' ? oldQty + 1 : oldQty - 1;
        }

        // Does not quality for min/max quantity
        if (newQty < minQty) {
            $el.val(oldqty);
            return swal({
                text: minError,
                type: 'error',
            });
        } else if (maxQty > 0 && newQty > maxQty) {
            $el.val(oldqty);
            return swal({
                text: maxError,
                type: 'error',
            });
        } else if (newQty < minQty) {
            $el.val(oldqty);
            return swal({
                text: eqError,
                type: 'error',
            });
        }


        this.$overlay.show();

        utils.api.cart.itemUpdate(itemId, newQty, (err, response) => {
            this.$overlay.hide();

            if (response.data.status === 'succeed') {
                // if the quantity is changed "1" from "0", we have to remove the row.
                const remove = (newQty === 0);

                this.refreshContent(remove);
            } else {
                $el.val(oldQty);
                swal({
                    text: response.data.errors.join('\n'),
                    type: 'error',
                });
            }
        });
    }

    cartRemoveItem(itemId) {
        this.$overlay.show();
        utils.api.cart.itemRemove(itemId, (err, response) => {
            if (response.data.status === 'succeed') {
                this.refreshContent(true);
            } else {
                swal({
                    text: response.data.errors.join('\n'),
                    type: 'error',
                });
            }
        });
    }

    cartEditOptions(itemId) {
        const modal = defaultModal();
        const options = {
            template: 'cart/modals/configure-product',
        };

        modal.open();

        utils.api.productAttributes.configureInCart(itemId, options, (err, response) => {
            modal.updateContent(response.content);

            this.bindGiftWrappingForm();
        });

        utils.hooks.on('product-option-change', (event, option) => {
            const $changedOption = $(option);
            const $form = $changedOption.parents('form');
            const $submit = $('input.button', $form);
            const $messageBox = $('.alertMessageBox');
            const item = $('[name="item_id"]', $form).attr('value');

            utils.api.productAttributes.optionChange(item, $form.serialize(), (err, result) => {
                const data = result.data || {};

                if (err) {
                    swal({
                        text: err,
                        type: 'error',
                    });
                    return false;
                }

                if (data.purchasing_message) {
                    $('p.alertBox-message', $messageBox).text(data.purchasing_message);
                    $submit.prop('disabled', true);
                    $messageBox.show();
                } else {
                    $submit.prop('disabled', false);
                    $messageBox.hide();
                }

                if (!data.purchasable || !data.instock) {
                    $submit.prop('disabled', true);
                } else {
                    $submit.prop('disabled', false);
                }
            });
        });
    }

    refreshContent(remove) {
        const $cartItemsRows = $('[data-item-row]', this.$cartContent);
        const $cartPageTitle = $('[data-cart-page-title]');
        const options = {
            template: {
                content: 'cart/content',
                totals: 'cart/totals',
                pageTitle: 'cart/page-title',
                statusMessages: 'cart/status-messages',
            },
        };

        this.$overlay.show();

        // Remove last item from cart? Reload
        if (remove && $cartItemsRows.length === 1) {
            return window.location.reload();
        }

        utils.api.cart.getContent(options, (err, response) => {
            this.$cartContent.html(response.content);
            this.$cartTotals.html(response.totals);
            this.$cartMessages.html(response.statusMessages);

            $cartPageTitle.replaceWith(response.pageTitle);
            this.bindEvents();
            this.$overlay.hide();

            const quantity = $('[data-cart-quantity]', this.$cartContent).data('cart-quantity') || 0;

            $('body').trigger('cart-quantity-update', quantity);
        });
    }

    bindCartEvents() {
        const debounceTimeout = 400;
        const cartUpdate = _.bind(_.debounce(this.cartUpdate, debounceTimeout), this);
        const cartRemoveItem = _.bind(_.debounce(this.cartRemoveItem, debounceTimeout), this);

        // cart update
        $('[data-cart-update]', this.$cartContent).on('click', (event) => {
            const $target = $(event.currentTarget);

            event.preventDefault();

            // update cart quantity
            cartUpdate($target);
        });

        // cart update
        $('.form-input--incrementTotal', this.$cartContent).on('change', (event) => {
            if (!$('.escapeon').length) {
                const $target = $(event.currentTarget);
                cartUpdate($target);
            }
        }).on('keydown', (event) => {
            if (event.which === 27 && (parseInt($(event.currentTarget).attr('data-old-value'), 10) !== parseInt(event.currentTarget.value, 10))) {
                $(event.currentTarget).addClass('escapeon');
                const $target = $(event.currentTarget);
                cartUpdate($target);
            }
        });


        $('.cart-remove', this.$cartContent).on('click', (event) => {
            const itemId = $(event.currentTarget).data('cart-itemid');
            const string = $(event.currentTarget).data('confirm-delete');
            swal({
                text: string,
                type: 'warning',
                showCancelButton: true,
            }).then(() => {
                // remove item from cart
                cartRemoveItem(itemId);
            });
            event.preventDefault();
        });

        $('[data-item-edit]', this.$cartContent).on('click', (event) => {
            const itemId = $(event.currentTarget).data('item-edit');

            event.preventDefault();
            // edit item in cart
            this.cartEditOptions(itemId);
        });
    }

    bindPromoCodeEvents() {
        const $couponContainer = $('.coupon-code');
        const $couponForm = $('.coupon-form');
        const $codeInput = $('[name="couponcode"]', $couponForm);

        $('.coupon-code-add').on('click', (event) => {
            event.preventDefault();

            $(event.currentTarget).hide();
            $couponContainer.show();
            $('.coupon-code-cancel').show();
            $codeInput.focus();
        });

        $('.coupon-code-cancel').on('click', (event) => {
            event.preventDefault();

            $couponContainer.hide();
            $('.coupon-code-cancel').hide();
            $('.coupon-code-add').show();
        });

        $couponForm.on('submit', (event) => {
            const code = $codeInput.val();

            event.preventDefault();

            // Empty code
            if (!code) {
                return swal({
                    text: $codeInput.data('error'),
                    type: 'error',
                });
            }

            utils.api.cart.applyCode(code, (err, response) => {
                if (response.data.status === 'success') {
                    this.refreshContent();
                } else {
                    swal({
                        text: response.data.errors.join('\n'),
                        type: 'error',
                    });
                }
            });
        });
    }

    bindGiftCertificateEvents() {
        const $certContainer = $('.gift-certificate-code');
        const $certForm = $('.cart-gift-certificate-form');
        const $certInput = $('[name="certcode"]', $certForm);

        $('.gift-certificate-add').on('click', (event) => {
            event.preventDefault();
            $(event.currentTarget).toggle();
            $certContainer.toggle();
            $('.gift-certificate-cancel').toggle();
        });

        $('.gift-certificate-cancel').on('click', (event) => {
            event.preventDefault();
            $certContainer.toggle();
            $('.gift-certificate-add').toggle();
            $('.gift-certificate-cancel').toggle();
        });

        $certForm.on('submit', (event) => {
            const code = $certInput.val();

            event.preventDefault();

            if (!giftCertCheck(code)) {
                return swal({
                    text: $certInput.data('error'),
                    type: 'error',
                });
            }

            utils.api.cart.applyGiftCertificate(code, (err, resp) => {
                if (resp.data.status === 'success') {
                    this.refreshContent();
                } else {
                    swal({
                        text: resp.data.errors.join('\n'),
                        type: 'error',
                    });
                }
            });
        });
    }

    bindGiftWrappingEvents() {
        const modal = defaultModal();

        $('[data-item-giftwrap]').on('click', (event) => {
            const itemId = $(event.currentTarget).data('item-giftwrap');
            const options = {
                template: 'cart/modals/gift-wrapping-form',
            };

            event.preventDefault();

            modal.open();

            utils.api.cart.getItemGiftWrappingOptions(itemId, options, (err, response) => {
                modal.updateContent(response.content);

                this.bindGiftWrappingForm();
            });
        });
    }

    bindGiftWrappingForm() {
        $('.giftWrapping-select').change((event) => {
            const $select = $(event.currentTarget);
            const id = $select.val();
            const index = $select.data('index');

            if (!id) {
                return;
            }

            const allowMessage = $select.find(`option[value=${id}]`).data('allow-message');

            $(`.giftWrapping-image-${index}`).hide();
            $(`#giftWrapping-image-${index}-${id}`).show();

            if (allowMessage) {
                $(`#giftWrapping-message-${index}`).show();
            } else {
                $(`#giftWrapping-message-${index}`).hide();
            }
        });

        $('.giftWrapping-select').trigger('change');

        function toggleViews() {
            const value = $('input:radio[name ="giftwraptype"]:checked').val();
            const $singleForm = $('.giftWrapping-single');
            const $multiForm = $('.giftWrapping-multiple');

            if (value === 'same') {
                $singleForm.show();
                $multiForm.hide();
            } else {
                $singleForm.hide();
                $multiForm.show();
            }
        }

        $('[name="giftwraptype"]').click(toggleViews);

        toggleViews();
    }

    bindEvents() {
        this.bindCartEvents();
        this.bindPromoCodeEvents();
        this.bindGiftWrappingEvents();
        this.bindGiftCertificateEvents();

        // initiate shipping estimator module
        this.shippingEstimator = new ShippingEstimator($('[data-shipping-estimator]'));
    }
}
