import PageManager from './page-manager';
import nod from './common/nod';
import $ from 'jquery';
import forms from './common/models/forms';

export default class ContactUs extends PageManager {
    onReady() {
        this.registerContactFormValidation();
    }

    registerContactFormValidation() {
        const formSelector = 'form[data-contact-form]';
        const contactUsValidator = nod({
            submit: `${formSelector} input[type="submit"]`,
        });
        const $contactForm = $(formSelector);

        contactUsValidator.add([
            {
                selector: `${formSelector} input[name="contact_email"]`,
                validate: (cb, val) => {
                    const result = forms.email(val);

                    cb(result);
                },
                errorMessage: this.context.contactEmail,
            },
            {
                selector: `${formSelector} textarea[name="contact_question"]`,
                validate: (cb, val) => {
                    const result = forms.notEmpty(val);

                    cb(result);
                },
                errorMessage: this.context.contactQuestion,
            },
        ]);

        $contactForm.submit((event) => {
            contactUsValidator.performCheck();

            if (contactUsValidator.areAll('valid')) {
                return;
            }

            event.preventDefault();
        });
    }
}
