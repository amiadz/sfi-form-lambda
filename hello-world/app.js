const fs = require('fs')
const Handlebars = require('handlebars')
const path = require('path')
const fetch = require('node-fetch')
const qs = require('qs');
require('dotenv').config()

const col_id_map = JSON.parse(process.env.COL_ID_MAP)

const query = `
query getEmployeeDetails($employee_id: String!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${col_id_map.id}, column_value: $employee_id) {
    id
        column_values {
            id
            title
            text
        }
    }
  }
  `
const mutation = `
mutation updateEmployeeDetails($itemId: Int!, $colVal: JSON!) {
  change_multiple_column_values (board_id: 3615818990, item_id: $itemId, column_values: $colVal) {
        id
        name
        column_values {
            id
            title
            text
        }
    }
  }
`

const requestHeaders = {
    "authorization": process.env.AUTHORIZATION,
    'Content-Type': 'application/json'
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

const forms = {
    'welcome': 'welcome_form.html',
    'verify': 'verify_form.handlebars',
    'employee': 'employee_form.handlebars',
}

exports.welcomeHandler = async (event, context) => {
    try {
        const welcome_html = getRenderedHTML({ }, forms.welcome)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
            },
            'body': welcome_html
        }
    } catch (err) {
        console.log(err);
        return err;
    }
};

exports.verifyHandler = async (event, context) => {
    try {
        var phone = event.queryStringParameters.phone
        const employee_id = event.queryStringParameters.employee_id

        // remove the start 0
        phone = "+972" + phone.slice(1)

        const verification = await client.verify.services(process.env.TWILIO_VERIFY_SERVICE)
            .verifications
            .create({
                to: phone,
                channel: 'whatsapp'
            });
            
        if (verification.status !== 'pending') {
            context.failed();
        } else {
            const verifyRendered = getRenderedHTML({
                'phone': phone,
                'employee_id': employee_id
            }, forms.verify)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/html',
                },
                'body': verifyRendered
            }
        }
    } catch (err) {
        console.log(err);
        return err;
    }
};

exports.employeeFormHandler = async (event, context) => {
    try {
        const phone = event.queryStringParameters.phone
        const code = event.queryStringParameters.code
        const employee_id = event.queryStringParameters.employee_id

        const verificationCheck = await client.verify.services(process.env.TWILIO_VERIFY_SERVICE)
            .verificationChecks
            .create({
                to: phone,
                code: code
            });

        if (verificationCheck.status !== 'approved') {
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'text/html'
                },
                'message': "Unauthorized"
            }
        }

        const variables = {
            employee_id: employee_id
        }

        const mondayDataJson = await getMondayDataJson(variables);

        const renderedHTML = getRenderedHTML(mondayDataJson, forms.employee);

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
            },
            'body': renderedHTML
        }
    } catch (err) {
        console.log(err);
        return {
            'statusCode': 500,
            'message': err
        }
    }
};

exports.submitEmployeeFormHandler = async (event, context) => {
    try {
        const colValJson = {
            [col_id_map.salary]: req.body.income
        }

        const variables = {
            colVal: JSON.stringify(colValJson),
            itemId: parseInt(req.body.itemId)
        }

        const mondayData = (await (await fetch('https://api.monday.com/v2', {
            method: 'post',
            headers: requestHeaders,
            body: JSON.stringify({
                mutation,
                variables
            })
        })).json())

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/html',
            },
            'body': 'OK!'
        }
    } catch (err) {
        console.log(err);
        return err;
    }
};

function getRenderedHTML(mondayDataJson, handlebarsName) {
    const formTemplate = fs.readFileSync(path.join('.', 'templates', handlebarsName), 'utf8');
    const template = Handlebars.compile(formTemplate);

    const renderedHTML = template(mondayDataJson);
    return renderedHTML;
}

async function getMondayDataJson(variables) {
    const mondayData = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query,
            variables
        })
    })).json()).data;

    const col_val_arr = Object.values(col_id_map);

    const mondayNecData = mondayData.items_by_column_values[0].column_values.reduce((map, cur) => {
        if (col_val_arr.includes(cur.id)) {
            map[cur.id] = cur.text;
        }
        return map;
    }, {})

    var mondayDataJson = {};
    for (const key in col_id_map) {
        const val = col_id_map[key];
        mondayDataJson[key] = mondayNecData[val]
    }
    mondayDataJson['itemId'] = mondayData.items_by_column_values[0].id
    
    return mondayDataJson;
}