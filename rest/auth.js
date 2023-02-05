const fetch = require('node-fetch')
require('dotenv').config()

const requestHeaders = {
    "authorization": process.env.AUTHORIZATION,
    'Content-Type': 'application/json'
}

const COL_ID_DETAILS_MAP = JSON.parse(process.env.COL_ID_DETAILS_MAP)
const COL_ID_MAP = JSON.parse(process.env.COL_ID_MAP)
const COL_ID_ID = process.env.COL_ID_ID

const baseUrl = 'https://api.monday.com/v2'

const getEmployeeDataquery = `
query getEmployeeDetails($employee_id: String!, $columns_ids: [String]!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${COL_ID_ID}, column_value: $employee_id) {
        column_values(ids: $columns_ids) {
            id
            text
        }
    }
  }
`

const getIdquery = `
query getEmployeeDetails($employee_id: String!) {
  items_by_column_values (board_id: ${process.env.BOARD_ID}, column_id: ${COL_ID_ID}, column_value: $employee_id) {
    id
  }
}
`

const mutation = `
mutation updateEmployeeDetails($itemId: Int!, $colVal: JSON!) {
  change_multiple_column_values (board_id: ${process.env.BOARD_ID}, item_id: $itemId, column_values: $colVal) {
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

const addFileMutation = `mutation add_file($file: File!, $itemId: Int!) {
    add_file_to_column(item_id: $itemId, column_id: "file", file: $file) {
        id
    }
}`

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

exports.login = async (event, context) => {
    try {
        console.log('====================================');
        console.log("event", event);
        console.log('====================================');
        var body = JSON.parse(event.body);

        var {
            phone,
            first_name,
            last_name
        } = await getEmployeeMainDetails(body.userId, Object.values(COL_ID_DETAILS_MAP));

        var method = body.method.toLowerCase();

        if (phone) {
            const verification = await client.verify.services(process.env.TWILIO_VERIFY_SERVICE)
                .verifications
                .create({
                    to: phone,
                    channel: method
                });

            if (verification.status !== 'pending') {
                context.failed();
            } else {
                var subPhone = phone.substring(6, 11);
                var hiddenPhone = phone.replace(subPhone, "X".repeat(subPhone.length));

                var response = {
                    userName: first_name + ' ' + last_name,
                    hiddenPhone: hiddenPhone
                }
                return {
                    statusCode: 200,
                    body: JSON.stringify(response)
                }
            }
        } else {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    "message": "data not found for: " + employeeId
                })
            }
        }
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            message: err
        };
    }
};

exports.verify = async (event, context) => {
    try {
        console.log('====================================');
        console.log("event", event);
        console.log('====================================');
        var body = JSON.parse(event.body);
        var code = body.code
        var employeeId = body.userId

        var phone = await getEmployeePhone(employeeId, [COL_ID_DETAILS_MAP["phone"]])

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

        const mondayDataJson = await getEmployeeFormDetails(employeeId, Object.values(COL_ID_MAP));

        return mondayDataJson ? {
            statusCode: 200,
            body: JSON.stringify(mondayDataJson)
        } : {
            statusCode: 404,
            body: JSON.stringify({
                "message": "data not found for: " + employeeId
            })
        }
    } catch (err) {
        console.log(err);
        return {
            'statusCode': 500,
            'message': err
        }
    }
};

exports.sendData = async (event, context) => {
    try {
        var body = JSON.parse(event.body);
        const userId = body.userId
        const employeeForm = body.employeeForm

        const colValJson = {}

        Object.entries(employeeForm).forEach(element => {
            colValJson[COL_ID_MAP[element[0]]] = element[1]
        });

        const mondayId = await getIdFromMonday(userId)

        var filesSendFunc = []
        body.files.forEach(fileElement => {
            filesSendFunc.push(sendFile(fileElement, mondayId))
        })
        await Promise.all(filesSendFunc)

        const variables = {
            colVal: JSON.stringify(colValJson),
            itemId: parseInt(mondayId)
        }

        const mondayData = (await (await fetch(baseUrl, {
            method: 'post',
            headers: requestHeaders,
            body: JSON.stringify({
                query: mutation,
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

async function getEmployeeMainDetails(employeeId, columnsIds) {
    var employeeData = await getEmployeeDataFromMonday(employeeId, columnsIds)

    if (!employeeData) {
        return undefined
    }

    // Add + before the prefix (972)
    var phone = '+' + employeeData[COL_ID_DETAILS_MAP.phone];
    var first_name = employeeData[COL_ID_DETAILS_MAP.first_name];
    var last_name = employeeData[COL_ID_DETAILS_MAP.last_name];
    return {
        phone,
        first_name,
        last_name
    };
}

async function getEmployeePhone(employeeId, columnsIds) {
    var employeeData = await getEmployeeDataFromMonday(employeeId, columnsIds)

    return employeeData ? '+' + employeeData[COL_ID_DETAILS_MAP.phone] : undefined;
}

async function getEmployeeFormDetails(employeeId, columnsIds) {
    var employeeData = await getEmployeeDataFromMonday(employeeId, columnsIds)

    if (!employeeData) {
        return undefined
    }

    var mondayDataJson = {};
    for (const key in COL_ID_MAP) {
        const val = COL_ID_MAP[key];
        mondayDataJson[key] = employeeData[val]
    }

    return mondayDataJson;
}

async function getEmployeeDataFromMonday(employeeId, columnsIds) {
    const variables = {
        employee_id: employeeId,
        columns_ids: columnsIds
    }

    const employeeDataJson = await getDataFromMonday(variables, getEmployeeDataquery)

    if (!employeeDataJson) {
        return undefined
    }

    var employeeData = convertEmployeeDataToMap(employeeDataJson)
    return employeeData
}

function convertEmployeeDataToMap(employeeDataJson) {
    return employeeDataJson?.column_values.reduce((map, cur) => {
        map[cur.id] = cur.text
        return map
    }, {})
}

async function getDataFromMonday(variables, query) {
    const employeeDataJson = (await (await fetch(process.env.MONDAY_URL, {
        method: 'post',
        headers: requestHeaders,
        body: JSON.stringify({
            query: query,
            variables
        })
    })).json()).data?.items_by_column_values[0];

    return employeeDataJson;
}

var sendFile = async (fileElement, mondayId) => {
    /// Notice the /file/ endpoint - only this endpoint will support variables in this type of call
    const url = `${baseUrl}/file`;
    const query = addFileMutation;

    var vars = {
        "itemId": parseInt(mondayId),
        // "column_id": "file",
    };

    var map = {
        "image": "variables.file"
    };

    /// this is the path to the file you'd like to upload to monday.com
    var upfile = fileElement.id;

    var data = "";
    const boundary = "xxxxxxxxxxxxxxx";


    //below, we will construct a multipart request. Take a look at the "name" within each part, as those will refer to different parts of the API call.

    // construct query part
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"query\"; \r\n";
    data += "Content-Type:application/json\r\n\r\n";
    data += "\r\n" + query + "\r\n";

    // construct variables part
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"variables\"; \r\n";
    data += "Content-Type:application/json \r\n\r\n";
    data += "\r\n" + JSON.stringify(vars) + "\r\n";

    // construct map part
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"map\"; \r\n";
    data += "Content-Type:application/json\r\n\r\n";
    data += "\r\n" + JSON.stringify(map) + "\r\n";

    // construct file part - the name needs to be the same as passed in the map part of the request. So if your map is {"image":"variables.file"}, the name should be image.
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"image\"; filename=\"" + upfile + "\"\r\n";
    data += "Content-Type:application/octet-stream\r\n\r\n";
    var payload = Buffer.concat([
        Buffer.from(data, "utf8"),
        Buffer.from(fileElement.file.split(',')[1], 'base64'),
        Buffer.from("\r\n--" + boundary + "--\r\n", "utf8"),
    ]);

    // construct request options
    var options = {
        method: 'post',
        headers: {
            "Content-Type": "multipart/form-data; boundary=" + boundary,
            "Authorization": process.env.AUTHORIZATION
        },
        body: payload,
    };

    // make request
    var response = await fetch(url, options)
    var json = await response.json()
    console.log(json);
}

async function getIdFromMonday(employeeId) {
    const variables = {
        employee_id: employeeId
    }

    const employeeDataJson = await getDataFromMonday(variables, getIdquery)

    return employeeDataJson?.id;
}